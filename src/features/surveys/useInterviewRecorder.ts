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

/** Outcome of finishing a recording: the sealed audio (null if nothing was recording), or a failure to retry. */
export type FinishResult = { ok: true; audio: DraftAudio | null } | { ok: false };

export interface InterviewRecorder {
  phase: RecorderPhase;
  elapsedMs: number;
  message: string | null;
  canOpenSettings: boolean;
  /** A stopped recording could not be sealed yet; `finish()` retries it. The raw file is kept meanwhile. */
  pendingFinalize: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /**
   * Stops an active recording (or waits for one already stopping, or retries
   * a pending one) and resolves once the file is sealed. Concurrent calls
   * share the same promise, so repeated taps never stop or seal twice.
   */
  finish: () => Promise<FinishResult>;
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
  const stopRef = useRef<(reason: StopReason) => Promise<FinishResult>>(async () => ({ ok: true, audio: null }));
  const phaseRef = useRef<RecorderPhase>("idle");
  const recorder = expoAudio!.useAudioRecorder(SPEECH_RECORDING!, (status: RecordingStatus) => {
    if (status.hasError) void stopRef.current("interrupted");
    else if (status.isFinished && phaseRef.current === "recording") void stopRef.current("max");
  });
  const recorderState = expoAudio!.useAudioRecorderState(recorder, 500);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  // The one finalization in flight (stop + seal): every caller awaits it.
  const inFlight = useRef<Promise<FinishResult> | null>(null);
  // Stopped but not sealed yet: what a retry needs. The raw file stays on disk until sealed.
  const pending = useRef<{ uri: string | null; durationMs: number; reason: StopReason } | null>(null);
  const [pendingFinalize, setPendingFinalize] = useState(false);

  const setPhaseBoth = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** Seals the stopped recording's raw file; on failure it stays pending (and on disk) for a retry. */
  const seal = useCallback(async (): Promise<FinishResult> => {
    const current = pending.current;
    if (!current || !scope) return { ok: false };
    setPhaseBoth("saving");
    try {
      if (!current.uri) {
        // The recorder never confirmed the stop: try again before reading the file.
        await recorder.stop().catch(() => undefined);
        current.uri = recorder.uri;
      }
      if (!current.uri) throw new Error("no recording file");
      const raw = new File(current.uri);
      const bytes = await raw.bytes();
      const clientAudioId = newClientId();
      await sealBytes(scope, audioName(clientAudioId), bytes);
      if (raw.exists) raw.delete();
      const audio: DraftAudio = {
        clientAudioId,
        mimeType: "audio/mp4",
        durationMs: current.durationMs,
        interrupted: current.reason === "interrupted",
        bytes: bytes.byteLength,
      };
      pending.current = null;
      setPendingFinalize(false);
      onSaved(audio);
      setMessage(
        current.reason === "interrupted"
          ? strings.surveys.recording.interrupted(formatDuration(current.durationMs))
          : current.reason === "max"
            ? strings.surveys.recording.maxReached
            : strings.surveys.recording.saved(formatDuration(current.durationMs)),
      );
      setPhaseBoth("saved");
      return { ok: true, audio };
    } catch (error) {
      setPendingFinalize(true);
      setMessage(error instanceof StorageFullError ? error.message : strings.surveys.recording.finalizeFailed);
      setPhaseBoth("failed");
      return { ok: false };
    } finally {
      await expoAudio!.setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  }, [recorder, scope, onSaved, setPhaseBoth]);

  const runOnce = useCallback((work: () => Promise<FinishResult>): Promise<FinishResult> => {
    if (inFlight.current) return inFlight.current;
    const promise = work().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = promise;
    return promise;
  }, []);

  const stop = useCallback(
    (reason: StopReason): Promise<FinishResult> => {
      if (inFlight.current) return inFlight.current;
      if (phaseRef.current !== "recording" || !scope) return Promise.resolve({ ok: true, audio: null });
      return runOnce(async () => {
        setPhaseBoth("saving");
        const durationMs = recorder.currentTime ? Math.round(recorder.currentTime * 1000) : recorderState.durationMillis;
        pending.current = { uri: null, durationMs, reason };
        try {
          await recorder.stop();
          pending.current.uri = recorder.uri;
        } catch {
          // Kept pending: seal() retries the stop before reading the file.
        }
        return seal();
      });
    },
    [recorder, recorderState.durationMillis, scope, runOnce, seal, setPhaseBoth],
  );

  const finish = useCallback((): Promise<FinishResult> => {
    if (inFlight.current) return inFlight.current;
    if (phaseRef.current === "recording") return stop("user");
    if (pending.current) return runOnce(seal);
    return Promise.resolve({ ok: true, audio: null });
  }, [stop, runOnce, seal]);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (!scope || phaseRef.current === "recording" || phaseRef.current === "starting" || inFlight.current) return;
    // A recording that still has to be sealed is never overwritten by a new one.
    if (pending.current) {
      setMessage(strings.surveys.recording.finalizeFailed);
      return;
    }
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
    pendingFinalize,
    start,
    stop: async () => {
      await stop("user");
    },
    finish,
    openSettings: () => void Linking.openSettings(),
  };
}

function useUnavailableRecorder(): InterviewRecorder {
  return {
    phase: "unavailable",
    elapsedMs: 0,
    message: strings.surveys.recording.unavailable,
    canOpenSettings: false,
    pendingFinalize: false,
    start: async () => undefined,
    stop: async () => undefined,
    finish: async () => ({ ok: true, audio: null }),
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
