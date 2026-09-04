import type { AwsFaceLivenessErrorCode } from "aws-face-liveness";
import type { BadgeTone } from "../../../design-system/theme";
import type { LivenessVerdict } from "../../../types/api";

// Non-liveness-challenge guidance (the AWS-owned FaceLivenessDetector view
// itself drives the actual oval/light/head-movement challenge -- this app
// never re-implements or duplicates that instruction set, see this file's
// module docblock in the capture flow). This is shown only on the
// explanation screen BEFORE the native component ever opens.
export const LIVENESS_EXPLANATION =
  "We need a short camera check to confirm that a real person is present. This only checks liveness -- it does not verify your identity or your documents.";

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
        label: "Liveness check completed",
        tone: "success",
        description: "We confirmed a real person was present for this check.",
      };
    case "review":
      return {
        label: "Needs review",
        tone: "warning",
        description: "Your submission is under manual review. No action is needed from you right now.",
      };
    case "not_live":
      return {
        label: "Couldn't confirm liveness",
        tone: "danger",
        description: "We couldn't confirm a real person was present. You can try again.",
      };
    default:
      return { label: "Pending", tone: "neutral", description: "" };
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
  session_expired: "That check took too long and expired. Let's try again.",
  invalid_session: "That check session is no longer valid. Let's try again.",
  provider_failed: "The liveness check couldn't be completed. Please try again.",
  malformed_provider_response: "Something went wrong while processing your check. Please try again.",
  configuration_error: "Liveness verification is temporarily unavailable. Please try again in a few minutes.",
  unauthorized_provider: "Liveness verification is temporarily unavailable. Please try again in a few minutes.",
  provider_timeout: "Liveness verification is temporarily unavailable. Please try again in a few minutes.",
  provider_unavailable: "Liveness verification is temporarily unavailable. Please try again in a few minutes.",
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
  return { message: "Something went wrong while processing your check. Please try again.", retryable: true };
}

// The native capture module's own closed error-category set (see
// AwsFaceLiveness.types.ts) -- these are errors from the CAPTURE attempt
// itself (before afilianet-api ever sees a completed session), distinct
// from the backend's own failure_reason set above. "cancelled" is
// deliberately NOT mapped here -- a user-cancelled capture shows no error
// message at all (Compliance state stays exactly as it was, see this
// phase's brief item 16), it's handled directly in LivenessCaptureFlow.
const NATIVE_ERROR_COPY: Record<Exclude<AwsFaceLivenessErrorCode, "cancelled">, string> = {
  camera_permission_denied: "Afilianet needs camera access to run this check. Please enable it in your device settings.",
  camera_unavailable: "This device doesn't have a usable camera right now.",
  session_invalid_or_expired: "That check took too long and expired. Let's try again.",
  network_error: "Your connection was interrupted. Please try again.",
  credentials_invalid: "Liveness verification is temporarily unavailable. Please try again in a few minutes.",
  unknown_error: "Something went wrong during your check. Please try again.",
};

export function livenessNativeErrorCopy(code: Exclude<AwsFaceLivenessErrorCode, "cancelled">): string {
  return NATIVE_ERROR_COPY[code];
}
