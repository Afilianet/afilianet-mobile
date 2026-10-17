import { requireOptionalNativeModule } from "expo";

/**
 * Whether this binary includes expo-audio's native module. An APK built
 * before expo-audio was added still runs the new JavaScript through Metro, but
 * importing "expo-audio" there throws "Cannot find native module 'ExpoAudio'"
 * -- and in development expo-router evaluates every route at startup, so a
 * top-level import would stop the whole app from opening, not just the
 * survey screen. Only useInterviewRecorder loads expo-audio, and only when
 * this is true.
 */
export const audioRecordingSupported: boolean = requireOptionalNativeModule("ExpoAudio") !== null;
