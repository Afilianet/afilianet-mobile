/* eslint-disable @typescript-eslint/no-require-imports -- loading route files by path, as expo-router does */
import { renderHook } from "@testing-library/react-native";
import { readdirSync, statSync } from "fs";
import { join } from "path";

// Opening this JavaScript (through Metro) on an APK built BEFORE expo-audio
// was added: the native module is missing, so importing "expo-audio" throws
// exactly as it does on the device. In development expo-router evaluates
// every route file at startup (validateRouteTreeExports -> loadRoute), so one
// route importing expo-audio at the top level would stop the whole app.
jest.setTimeout(60_000);

jest.mock("expo", () => ({
  ...jest.requireActual("expo"),
  requireOptionalNativeModule: (name: string) => (name === "ExpoAudio" ? null : jest.requireActual("expo").requireOptionalNativeModule(name)),
}));
// Not under test here: Jest has no AsyncStorage native module (the APK does).
jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-audio", () => {
  throw new Error("Cannot find native module 'ExpoAudio'");
});

const APP_DIR = join(__dirname, "..", "..", "app");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("JavaScript from this branch on the previous APK (no ExpoAudio native module)", () => {
  it("evaluates every route file, as expo-router does at startup, without importing expo-audio", () => {
    const files = routeFiles(APP_DIR);
    expect(files.length).toBeGreaterThan(30);
    // One module registry, like the app: each route is evaluated once.
    for (const file of files) {
      expect(() => require(file)).not.toThrow();
    }
    expect(files.some((file) => file.includes("survey-response"))).toBe(true);
  });

  it("reports recording as unavailable instead of failing", () => {
    const { audioRecordingSupported } = require("../../features/surveys/audioSupport");
    const { SPEECH_RECORDING } = require("../../features/surveys/useInterviewRecorder");
    expect(audioRecordingSupported).toBe(false);
    expect(SPEECH_RECORDING).toBeNull();
  });

  it("renders the interview recorder as unavailable, with an explanation, and starting it does nothing", async () => {
    const { useInterviewRecorder } = require("../../features/surveys/useInterviewRecorder");
    const onSaved = jest.fn();
    const hook = await renderHook(() => useInterviewRecorder({ userId: "user-1", organizationId: "org-a" }, onSaved));
    expect(hook.result.current.phase).toBe("unavailable");
    expect(hook.result.current.message).toMatch(/no puede grabar audio/);
    await hook.result.current.start();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
