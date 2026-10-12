import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { ensureSpace, sealBytes, StorageFullError } from "./vault";
import { MAX_RECORDING_SECONDS, useInterviewRecorder } from "./useInterviewRecorder";

let mockStatusListener: ((status: { hasError: boolean; isFinished: boolean }) => void) | undefined;
const mockRecorder = {
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
  uri: "file:///cache/rec.m4a" as string | null,
  currentTime: 12.4,
};

jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a", sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 } },
  useAudioRecorder: (_options: unknown, listener: typeof mockStatusListener) => {
    mockStatusListener = listener;
    return mockRecorder;
  },
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 12400, mediaServicesDidReset: false, canRecord: true, url: null }),
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

const mockRawDelete = jest.fn();
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
    delete() {
      mockRawDelete();
    }
  },
}));

jest.mock("./vault", () => {
  class StorageFullError extends Error {}
  return { StorageFullError, ensureSpace: jest.fn(), sealBytes: jest.fn(async () => 3) };
});
jest.mock("./outbox", () => ({ audioName: (id: string) => `audio-${id}`, newClientId: () => "aud-1" }));

const getPermission = getRecordingPermissionsAsync as jest.Mock;
const requestPermission = requestRecordingPermissionsAsync as jest.Mock;
const SCOPE = { userId: "user-1", organizationId: "org-a" };
let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  getPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  requestPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

async function startRecording(onSaved = jest.fn()) {
  const hook = await renderHook(() => useInterviewRecorder(SCOPE, onSaved));
  await act(async () => {
    await hook.result.current.start();
  });
  return { hook, onSaved };
}

describe("useInterviewRecorder", () => {
  it("records only after the explicit start, exclusive audio focus, no background recording, capped at 30 minutes", async () => {
    const { hook } = await startRecording();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true, interruptionMode: "doNotMix", allowsBackgroundRecording: false }));
    expect(mockRecorder.record).toHaveBeenCalledWith({ forDuration: MAX_RECORDING_SECONDS });
    expect(hook.result.current.phase).toBe("recording");
  });

  it("seals the audio into the vault, deletes the raw file and reports a normal stop", async () => {
    const { hook, onSaved } = await startRecording();
    await act(async () => {
      await hook.result.current.stop();
    });
    expect(sealBytes).toHaveBeenCalledWith(SCOPE, "audio-aud-1", new Uint8Array([1, 2, 3]));
    expect(mockRawDelete).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ clientAudioId: "aud-1", interrupted: false, durationMs: 12400 }));
    expect(hook.result.current.message).toBe("Audio guardado en el teléfono (0:12)");
  });

  it("stops and keeps what was recorded when a call or the home button sends the app to the background", async () => {
    const { hook, onSaved } = await startRecording();
    await act(async () => {
      appStateListener?.("background");
    });
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ interrupted: true }));
    expect(hook.result.current.message).toMatch(/se detuvo por una interrupción/);
  });

  it("treats a recorder error as an interruption, and the time limit as a normal end", async () => {
    const first = await startRecording();
    await act(async () => {
      mockStatusListener?.({ hasError: true, isFinished: false });
    });
    expect(first.onSaved).toHaveBeenCalledWith(expect.objectContaining({ interrupted: true }));

    const second = await startRecording();
    await act(async () => {
      mockStatusListener?.({ hasError: false, isFinished: true });
    });
    expect(second.onSaved).toHaveBeenCalledWith(expect.objectContaining({ interrupted: false }));
    expect(second.hook.result.current.message).toBe("Se alcanzó el máximo de 30 minutos y la grabación se detuvo.");
  });

  it("explains a denied microphone and offers Settings when the system will not ask again", async () => {
    getPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    const { hook } = await startRecording();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe("denied");
    expect(hook.result.current.canOpenSettings).toBe(true);
    expect(hook.result.current.message).toMatch(/Sin permiso de micrófono/);
  });

  it("asks once when the permission is undetermined", async () => {
    getPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    await startRecording();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalled();
  });

  it("does not even ask for the microphone when there is not enough storage", async () => {
    (ensureSpace as jest.Mock).mockImplementationOnce(() => {
      throw new StorageFullError("Tu teléfono tiene poco espacio libre.");
    });
    const { hook } = await startRecording();
    expect(getPermission).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe("failed");
    expect(hook.result.current.message).toBe("Tu teléfono tiene poco espacio libre.");
  });
});
