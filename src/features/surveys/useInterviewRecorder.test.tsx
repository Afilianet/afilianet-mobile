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

// The native module is present (a binary built with expo-audio).
jest.mock("./audioSupport", () => ({ audioRecordingSupported: true }));

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
    expect(hook.result.current.message).toBe("Grabación lista · 0:12");
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

  describe("finish(): automatic stop before saving or sending", () => {
    function deferred<T = void>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    it("a slow finalization is shared: two finishes stop and seal once and both get the same audio", async () => {
      const stopping = deferred<undefined>();
      mockRecorder.stop.mockImplementationOnce(() => stopping.promise);
      const { hook, onSaved } = await startRecording();

      let first!: Promise<unknown>;
      let second!: Promise<unknown>;
      await act(async () => {
        first = hook.result.current.finish();
        second = hook.result.current.finish();
      });
      expect(hook.result.current.phase).toBe("saving");
      await act(async () => {
        stopping.resolve(undefined);
        await Promise.all([first, second]);
      });

      expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
      expect(sealBytes).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      await expect(first).resolves.toEqual({ ok: true, audio: expect.objectContaining({ clientAudioId: "aud-1", durationMs: 12400 }) });
      await expect(second).resolves.toEqual(await first);
      expect(hook.result.current.phase).toBe("saved");
    });

    it("a failed seal keeps the raw recording, never starts over it, and a retry seals it without stopping again", async () => {
      (sealBytes as jest.Mock).mockRejectedValueOnce(new Error("disk"));
      const { hook, onSaved } = await startRecording();

      let result: unknown;
      await act(async () => {
        result = await hook.result.current.finish();
      });
      expect(result).toEqual({ ok: false });
      expect(hook.result.current.pendingFinalize).toBe(true);
      expect(hook.result.current.message).toMatch(/No se pudo terminar de guardar la grabación/);
      expect(mockRawDelete).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();

      // A new recording is never started over the unsealed one.
      mockRecorder.record.mockClear();
      await act(async () => {
        await hook.result.current.start();
      });
      expect(mockRecorder.record).not.toHaveBeenCalled();

      await act(async () => {
        result = await hook.result.current.finish();
      });
      expect(result).toEqual({ ok: true, audio: expect.objectContaining({ clientAudioId: "aud-1" }) });
      expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
      expect(mockRawDelete).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(hook.result.current.pendingFinalize).toBe(false);
    });

    it("a failed stop is retried before reading the file", async () => {
      mockRecorder.stop.mockRejectedValueOnce(new Error("busy"));
      const { hook, onSaved } = await startRecording();
      let result: unknown;
      await act(async () => {
        result = await hook.result.current.finish();
      });
      expect(mockRecorder.stop).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true, audio: expect.objectContaining({ clientAudioId: "aud-1" }) });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("with nothing recording, finish resolves at once without touching the recorder", async () => {
      const hook = await renderHook(() => useInterviewRecorder(SCOPE, jest.fn()));
      let result: unknown;
      await act(async () => {
        result = await hook.result.current.finish();
      });
      expect(result).toEqual({ ok: true, audio: null });
      expect(mockRecorder.stop).not.toHaveBeenCalled();
    });
  });
});
