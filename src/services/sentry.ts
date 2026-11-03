import * as Sentry from "@sentry/react-native";
import { config } from "../config/env";
import { scrubBreadcrumb, scrubErrorEvent, scrubSpan, scrubText, scrubTransactionEvent } from "./telemetryScrub";

// The native SDK ships with io.sentry.auto-init=false (@sentry/react-native's
// AndroidManifest), so skipping Sentry.init also leaves native crash
// reporting, NDK and performance off: nothing starts without this call.
export const sentryEnabled = config.sentryEnabled && config.sentryDsn.length > 0;

/**
 * Native crash events are written by the native SDK and skip these JS
 * callbacks; they carry only the scope synced from JS (breadcrumbs that
 * already passed beforeBreadcrumb, no user) plus device context.
 */
export function sentryOptions(): Sentry.ReactNativeOptions {
  return {
    dsn: config.sentryDsn,
    environment: config.appEnv,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    maxBreadcrumbs: 50,
    // The SDK default ([/.*/]) adds sentry-trace and baggage headers, with the
    // transaction name, to every request, presigned uploads included.
    tracePropagationTargets: [],
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubErrorEvent,
    beforeSendTransaction: scrubTransactionEvent,
    beforeSendSpan: scrubSpan,
  };
}

/** `overrides` exists for the local harness (in-memory transport), never for the app. */
export function initSentry(overrides: Partial<Sentry.ReactNativeOptions> = {}): void {
  if (!sentryEnabled) return;
  Sentry.init({ ...sentryOptions(), ...overrides });
  // The dynamic sampling context travels in each envelope header (and in
  // baggage) with the root span's name, outside beforeSendTransaction.
  Sentry.getClient()?.on("createDsc", (dsc) => {
    if (dsc.transaction) dsc.transaction = scrubText(dsc.transaction);
  });
}

export function captureException(error: unknown): void {
  if (!sentryEnabled) return;
  Sentry.captureException(error);
}
