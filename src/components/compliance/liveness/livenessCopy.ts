import type { AwsFaceLivenessErrorCode } from "aws-face-liveness";
import type { BadgeTone } from "../../../design-system/theme";
import { strings } from "../../../i18n";
import type { LivenessVerdict } from "../../../types/api";

// Non-liveness-challenge guidance (the AWS-owned FaceLivenessDetector view
// itself drives the actual oval/light/head-movement challenge -- this app
// never re-implements or duplicates that instruction set, see this file's
// module docblock in the capture flow). This is shown only on the
// explanation screen BEFORE the native component ever opens.
export const LIVENESS_EXPLANATION = strings.liveness.explanation;

/**
 * `verdict: "live"` means ONLY "a real person appears to be present in
 * front of the camera right now" -- never "identity verified", never
 * document verification, never fraud ruled out, and never combined with
 * Face Match's own separate verdict (a completely different comparison).
 * This view/copy never says "Identity verified", even after a "live"
 * result -- biometric assurance is a backend-side combination of multiple
 * signals, never something this screen claims on its own.
 */
export function livenessVerdictCopy(verdict: LivenessVerdict | null): { label: string; tone: BadgeTone; description: string } {
  switch (verdict) {
    case "live":
      return {
        label: strings.liveness.completedTitle,
        tone: "success",
        description: strings.liveness.completedDescription,
      };
    case "review":
      return {
        label: strings.liveness.needsReviewTitle,
        tone: "warning",
        description: strings.compliance.manualReviewNotice,
      };
    case "not_live":
      return {
        label: strings.liveness.couldNotConfirmTitle,
        tone: "danger",
        description: strings.liveness.couldNotConfirmDescription,
      };
    default:
      return { label: strings.liveness.pendingLabel, tone: "neutral", description: "" };
  }
}

// The backend's own closed failure_reason set (LivenessProcessingService /
// AwsRekognitionLivenessClient in afilianet-api) -- every one of these is a
// TECHNICAL/session-lifecycle failure, never a biometric-mismatch claim, and
// none of them consumes ComplianceStep.attempt_count server-side (a genuine
// "not_live" verdict is the only retryable-with-attempt-cost outcome; these
// are retryable at no cost). "session_expired" and "invalid_session" both
// mean the session itself is no longer usable -- but recovering from EITHER
// is the exact same action as recovering from any other reason: calling
// createLivenessSession again. The backend's own idempotency rule (reuse if
// still valid, otherwise create fresh) means mobile never has to decide
// "reuse vs. recreate" itself -- there is deliberately only one recovery
// action in this app, never a separate "resume" vs "start new" choice.
const FAILURE_COPY: Record<string, string> = {
  session_expired: strings.liveness.failureReasons.sessionExpired,
  invalid_session: strings.liveness.failureReasons.invalidSession,
  provider_failed: strings.liveness.failureReasons.providerFailed,
  malformed_provider_response: strings.liveness.failureReasons.malformedResponse,
  configuration_error: strings.liveness.failureReasons.serviceUnavailable,
  unauthorized_provider: strings.liveness.failureReasons.serviceUnavailable,
  provider_timeout: strings.liveness.failureReasons.serviceUnavailable,
  provider_unavailable: strings.liveness.failureReasons.serviceUnavailable,
};

/**
 * Maps a technical failure_reason to safe copy -- never the raw internal
 * string. Every category here is retryable (see this file's docblock
 * above); `retryable` is only false for the mapping's own safety net (a
 * reason this app doesn't recognize at all shouldn't silently invite a
 * retry loop against something possibly not actually failed).
 */
export function livenessFailureCopy(reason: string | null): { message: string; retryable: boolean } {
  if (reason !== null && reason in FAILURE_COPY) {
    return { message: FAILURE_COPY[reason], retryable: true };
  }
  return { message: strings.liveness.failureReasons.default, retryable: true };
}

// The native capture module's own closed error-category set (see
// AwsFaceLiveness.types.ts) -- these are errors from the CAPTURE attempt
// itself (before afilianet-api ever sees a completed session), distinct
// from the backend's own failure_reason set above. "cancelled" is
// deliberately NOT mapped here -- a user-cancelled capture shows no error
// message at all (Compliance state stays exactly as it was, see this
// phase's brief item 16), it's handled directly in LivenessCaptureFlow.
const NATIVE_ERROR_COPY: Record<Exclude<AwsFaceLivenessErrorCode, "cancelled">, string> = {
  camera_permission_denied: strings.liveness.nativeErrors.cameraPermissionDenied,
  camera_unavailable: strings.liveness.nativeErrors.cameraUnavailable,
  session_invalid_or_expired: strings.liveness.nativeErrors.sessionExpired,
  network_error: strings.liveness.nativeErrors.networkError,
  credentials_invalid: strings.liveness.nativeErrors.credentialsInvalid,
  unknown_error: strings.liveness.nativeErrors.unknownError,
};

export function livenessNativeErrorCopy(code: Exclude<AwsFaceLivenessErrorCode, "cancelled">): string {
  return NATIVE_ERROR_COPY[code];
}
