import Constants from "expo-constants";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { ComplianceGeolocationSubmission } from "../types/api";

/**
 * A single current-position fetch has no built-in timeout in expo-location's
 * public API (confirmed against the SDK 57 docs -- LocationOptions has no
 * `timeout` field), so a stuck GPS fix on some devices could otherwise hang
 * this indefinitely. This is a client-side safety net only, not a backend
 * contract value -- 15s is generous enough for a real fix outdoors/near a
 * window while still resolving well within a user's patience for an
 * OPTIONAL, non-blocking feature.
 */
const POSITION_TIMEOUT_MS = 15000;

/**
 * Every possible outcome of one geolocation attempt, already free of any
 * ambiguity about what to submit -- callers never branch on raw
 * expo-location types, only on this. Deliberately never throws: every native
 * failure mode (services off, permission refused, position fetch failure/
 * timeout, or any unexpected native error) resolves to one of these, never a
 * rejected promise, so a caller can always safely await this and move on.
 */
export type GeolocationCaptureOutcome =
  | { kind: "captured"; latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "failed"; failureReason: string };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), POSITION_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Requests FOREGROUND-ONLY permission (never background -- this app never
 * calls requestBackgroundPermissionsAsync), then fetches ONE current
 * position. No watchPosition, no continuous tracking, no reverse geocoding.
 * `location_provider` is deliberately never populated here -- expo-location's
 * LocationObject exposes no gps/network/fused/passive distinction on either
 * platform (confirmed against the SDK 57 docs), so this app omits that field
 * entirely rather than guessing at it, exactly as the backend contract
 * allows.
 */
export async function captureDeviceGeolocation(): Promise<GeolocationCaptureOutcome> {
  let servicesEnabled: boolean;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    return { kind: "unavailable" };
  }
  if (!servicesEnabled) {
    return { kind: "unavailable" };
  }

  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return { kind: "unavailable" };
  }
  if (!permission.granted) {
    return { kind: "denied" };
  }

  try {
    const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return {
      kind: "captured",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? 0,
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  } catch {
    // Covers both the manual timeout above and any native
    // getCurrentPositionAsync failure (e.g. no fix available) -- "timeout"
    // is the only failure_reason the backend contract documents an example
    // for, so every capture-time failure reports that one safe, known value
    // rather than inventing a new reason string.
    return { kind: "failed", failureReason: "timeout" };
  }
}

function currentPlatform(): "android" | "ios" | undefined {
  return Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : undefined;
}

function currentAppVersion(): string | undefined {
  // Constants.expoConfig is only populated from a real build/manifest --
  // stays undefined harmlessly in any environment (tests, an unusual dev
  // setup) where it isn't, and the field is optional on the wire per the
  // backend contract.
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && version.length > 0 ? version : undefined;
}

/**
 * Maps one outcome to the exact request body the backend contract
 * documents. Coordinates only ever appear on the "captured" shape;
 * `permission_status`/`capture_status` are set per the contract's three
 * documented request shapes, and `source` is never included anywhere.
 */
export function buildGeolocationSubmission(outcome: GeolocationCaptureOutcome): ComplianceGeolocationSubmission {
  switch (outcome.kind) {
    case "captured":
      return {
        permission_status: "granted",
        capture_status: "captured",
        latitude: outcome.latitude,
        longitude: outcome.longitude,
        accuracy_meters: outcome.accuracyMeters,
        platform: currentPlatform(),
        app_version: currentAppVersion(),
        captured_at: outcome.capturedAt,
      };
    case "denied":
      return { permission_status: "denied", capture_status: "skipped" };
    case "unavailable":
      return { permission_status: "unavailable", capture_status: "skipped" };
    case "failed":
      return { permission_status: "granted", capture_status: "failed", failure_reason: outcome.failureReason };
  }
}
