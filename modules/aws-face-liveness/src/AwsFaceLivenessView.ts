import { requireNativeViewManager } from "expo-modules-core";
import type { ComponentType } from "react";
import type { AwsFaceLivenessViewProps } from "./AwsFaceLiveness.types";

// "AwsFaceLiveness" here must match expo-module.config.json's ios/android
// module registrations and the `Name(...)` declared in
// AwsFaceLivenessModule.swift / AwsFaceLivenessModule.kt exactly -- Expo's
// autolinking resolves this native view purely by that string.
export const AwsFaceLivenessView: ComponentType<AwsFaceLivenessViewProps> = requireNativeViewManager("AwsFaceLiveness");
