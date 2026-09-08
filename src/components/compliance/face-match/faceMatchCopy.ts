import type { BadgeTone } from "../../../design-system/theme";
import type { FaceMatchVerdict } from "../../../types/api";

// Concise, non-liveness guidance (Phase 9D.3's explicit "face match only,
// no liveness challenge" scope) -- never "blink"/"turn your head"/"smile",
// those instructions belong to a future liveness step, not this one.
export const SELFIE_GUIDANCE = [
  "Look directly at the camera",
  "Make sure only you are in the frame",
  "Remove sunglasses, hats, or anything covering your face",
  "Use good, even lighting",
  "Keep your face clear and reasonably close to the camera",
];

/**
 * `verdict: "match"` means ONLY "the selfie appears sufficiently similar to
 * the document portrait according to the configured face-comparison
 * engine" -- never "identity verified", never liveness, never government
 * validation, never fraud ruled out. See this module's docblock in
 * FaceMatchResultView.tsx for the full product-semantics reasoning.
 */
export function faceMatchVerdictCopy(verdict: FaceMatchVerdict | null): { label: string; tone: BadgeTone; description: string } {
  switch (verdict) {
    case "match":
      return {
        label: "Face matched",
        tone: "success",
        description: "Your selfie matched your identity document photo.",
      };
    case "review":
      return {
        label: "Needs review",
        tone: "warning",
        description: "Your submission is under manual review. No action is needed from you right now.",
      };
    case "no_match":
      return {
        label: "Couldn't confirm the match",
        tone: "danger",
        description: "We couldn't confirm your selfie matches your identity document photo.",
      };
    default:
      return { label: "Pending", tone: "neutral", description: "" };
  }
}

// The identity engine's own stable failure_reason strings (see
// AfilianetFaceMatchEngine/FakeFaceMatchEngine in afilianet-api) --
// PROBE (selfie) vs REFERENCE (document portrait) failures are distinguished
// by an exact `_probe`/`_reference` suffix convention, never guessed.
export function isReferenceSideFailure(reason: string | null): boolean {
  return reason !== null && reason.endsWith("_reference");
}

const PROBE_FAILURE_COPY: Record<string, string> = {
  no_face_probe: "We couldn't clearly detect your face. Take another photo with your face centered.",
  multiple_faces_probe: "Make sure only you are visible in the photo.",
  face_too_small_probe: "Move a little closer to the camera.",
  image_decode_failed_probe: "That photo couldn't be read. Please retake it.",
};

const ENGINE_UNAVAILABLE_REASONS = new Set([
  "unreachable",
  "unauthorized",
  "model_unavailable",
  "engine_error",
  "malformed_response",
  "image_too_large",
  "evidence_unavailable",
]);

/**
 * Maps a technical/capture-quality `failure_reason` to safe, understandable
 * copy -- never the raw internal string, never words like "fraud"/"fake
 * person"/"identity stolen" (a technical or capture-quality failure is
 * never a biometric-mismatch claim, see FaceMatchStatus's docblock in
 * afilianet-api). The selfie is never BLAMED for a REFERENCE-side failure
 * (the message points at the Identity document step, not the selfie) --
 * but a retry is always offered regardless of which side failed (see
 * FaceMatchResultView.tsx). A prior version of this app withheld the
 * retry button entirely for a reference-side failure on the theory that
 * "retaking the selfie can't fix a document-portrait problem" -- true, but
 * with identity_document already `passed` (it has no recapture action of
 * its own once resolved), that left the affiliate with a failed, current,
 * actionable face_match step and NO clickable action anywhere in the app
 * (a real physical-device bug: compliance case 72, face_match `failed`,
 * identity_document/biometric_liveness both already `passed`). The
 * backend's own trigger() gate remains the authoritative check either
 * way -- retrying when the reference genuinely still can't be used
 * surfaces via the existing 409 "complete your identity document
 * verification first" handling (FaceMatchCaptureFlow.tsx's handleSubmit),
 * never a silently invented client-side success.
 */
export function faceMatchFailureCopy(reason: string | null): { message: string } {
  if (reason !== null && isReferenceSideFailure(reason)) {
    return {
      message:
        "We couldn't use your identity document photo for this comparison. Please check the Identity document step -- it may need to be recaptured or reprocessed.",
    };
  }
  if (reason !== null && reason in PROBE_FAILURE_COPY) {
    return { message: PROBE_FAILURE_COPY[reason] };
  }
  if (reason !== null && ENGINE_UNAVAILABLE_REASONS.has(reason)) {
    return { message: "Face verification is temporarily unavailable. Please try again later." };
  }
  return { message: "Something went wrong while processing your selfie. Please try again." };
}
