import type { RecordingOptions, RecordingStatus } from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { strings } from "../../i18n";
import { audioRecordingSupported } from "./audioSupport";
import type { DraftAudio } from "./library";
import { audioName, newClientId } from "./outbox";
import { ensureSpace, sealBytes, StorageFullError, type SurveyScope } from "./vault";

// Loaded lazily: an APK without the native module must still open (see audioSupport.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const expoAudio: typeof import("expo-audio") | null = audioRecordingSupported ? require("expo-audio") : null;

/** Speech, not music: AAC in .m4a, mono, 64 kbps (~0.5 MB per minute). */
export const SPEECH_RECORDING: RecordingOptions | null = expoAudio
  ? { ...expoAudio.RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 }
  : null;
export const MAX_RECORDING_SECONDS = 30 * 60;
/** Reserve before starting: the full 30 minutes at 64 kbps, plus margin. */
const RECORDING_RESERVE_BYTES = 16 * 1024 * 1024;

/** "unavailable": this binary has no microphone module; the interview continues without audio. */
export type RecorderPhase = "idle" | "starting" | "recording" | "saving" | "saved" | "denied" | "failed" | "unavailable";

export interface InterviewRecorder {
  phase: RecorderPhase;
  elapsedMs: number;
  message: string | null;
  canOpenSettings: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  openSettings: () => void;
}

type StopReason = "user" | "interrupted" | "max";

/**
 * Interview audio, only ever started by an explicit tap AFTER the consent
 * step (the caller does not render the start button before consent).
 *
 * - No background recording (the plugin keeps enableBackgroundRecording off):
 *   if the app leaves the foreground -- an incoming call, the home button,
 *   the screen locking -- or the system reports an error/media reset, the
 *   recording is stopped and what was captured is KEPT, marked interrupted.
 * - Audio focus is requested exclusively ("doNotMix") so Android reports
 *   focus loss (calls) instead of silently mixing.
 * - The raw file is sealed into the per-account/organization vault right
 *   after stopping and the unencrypted original is deleted.
 */
function useNativeRecorder(scope: SurveyScope | null, onSaved: (audio: DraftAudio) => void): InterviewRecorder {
  const stopRef = useRef<(reason: StopReason) => Promise<void>>(async () => undefined);
  const phaseRef = useRef<RecorderPhase>("idle");
  const recorder = expoAudio!.useAudioRecorder(SPEECH_RECORDING!, (status: RecordingStatus) => {
    if (status.hasError) void stopRef.current("interrupted");
    else if (status.isFinished && phaseRef.current === "recording") void stopRef.current("max");
  });
  const recorderState = expoAudio!.useAudioRecorderState(recorder, 500);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const stopping = useRef(false);

  const setPhaseBoth = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stop = useCallback(
    async (reason: StopReason) => {
      if (phaseRef.current !== "recording" || stopping.current || !scope) return;
      stopping.current = true;
      setPhaseBoth("saving");
      const durationMs = recorder.currentTime ? Math.round(recorder.currentTime * 1000) : recorderState.durationMillis;
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("no recording file");
        const raw = new File(uri);
        const bytes = await raw.bytes();
        const clientAudioId = newClientId();
        await sealBytes(scope, audioName(clientAudioId), bytes);
        if (raw.exists) raw.delete();
        const audio: DraftAudio = {
          clientAudioId,
          mimeType: "audio/mp4",
          durationMs,
          interrupted: reason === "interrupted",
          bytes: bytes.byteLength,
        };
        onSaved(audio);
        setMessage(
          reason === "interrupted"
            ? strings.surveys.recording.interrupted(formatDuration(durationMs))
            : reason === "max"
              ? strings.surveys.recording.maxReached
              : strings.surveys.recording.saved(formatDuration(durationMs)),
        );
        setPhaseBoth("saved");
      } catch (error) {
        setMessage(error instanceof StorageFullError ? error.message : strings.surveys.recording.failed);
        setPhaseBoth("failed");
      } finally {
        stopping.current = false;
        await expoAudio!.setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
    },
    [recorder, recorderState.durationMillis, scope, onSaved, setPhaseBoth],
  );
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (!scope || phaseRef.current === "recording" || phaseRef.current === "starting") return;
    setMessage(null);
    setCanOpenSettings(false);
    try {
      ensureSpace(scope, RECORDING_RESERVE_BYTES);
    } catch (error) {
      setMessage(error instanceof StorageFullError ? error.message : strings.surveys.storageFull);
      setPhaseBoth("failed");
      return;
    }
    setPhaseBoth("starting");
    try {
      let permission = await expoAudio!.getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await expoAudio!.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMessage(strings.surveys.recording.permissionDenied);
        setCanOpenSettings(!permission.canAskAgain);
        setPhaseBoth("denied");
        return;
      }
      await expoAudio!.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: "doNotMix", allowsBackgroundRecording: false });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      setPhaseBoth("recording");
    } catch {
      setMessage(strings.surveys.recording.failed);
      setPhaseBoth("failed");
      await expoAudio!.setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  }, [recorder, scope, setPhaseBoth]);

  // Leaving the foreground (call, lock, home) ends the recording; nothing records unseen.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && phaseRef.current === "recording") void stopRef.current("interrupted");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (recorderState.mediaServicesDidReset && phaseRef.current === "recording") void stopRef.current("interrupted");
  }, [recorderState.mediaServicesDidReset]);

  // Leaving the screen mid-recording keeps what was captured.
  useEffect(() => () => {
    if (phaseRef.current === "recording") void stopRef.current("interrupted");
  }, []);

  return {
    phase,
    elapsedMs: phase === "recording" ? recorderState.durationMillis : 0,
    message,
    canOpenSettings,
    start,
    stop: () => stop("user"),
    openSettings: () => void Linking.openSettings(),
  };
}

function useUnavailableRecorder(): InterviewRecorder {
  return {
    phase: "unavailable",
    elapsedMs: 0,
    message: strings.surveys.recording.unavailable,
    canOpenSettings: false,
    start: async () => undefined,
    stop: async () => undefined,
    openSettings: () => undefined,
  };
}

/** Chosen once per binary, so hook order never changes between renders. */
export const useInterviewRecorder: (scope: SurveyScope | null, onSaved: (audio: DraftAudio) => void) => InterviewRecorder =
  expoAudio ? useNativeRecorder : useUnavailableRecorder;

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
