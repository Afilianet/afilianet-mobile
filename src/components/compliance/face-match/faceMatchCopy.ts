import type { BadgeTone } from "../../../design-system/theme";
import { strings } from "../../../i18n";
import type { FaceMatchVerdict } from "../../../types/api";

// Concise, non-liveness guidance (Phase 9D.3's explicit "face match only,
// no liveness challenge" scope) -- never "blink"/"turn your head"/"smile",
// those instructions belong to a future liveness step, not this one.
export const SELFIE_GUIDANCE = strings.faceMatch.guidance;

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
        label: strings.faceMatch.matchedTitle,
        tone: "success",
        description: strings.faceMatch.matchedDescription,
      };
    case "review":
      return {
        label: strings.faceMatch.needsReviewTitle,
        tone: "warning",
        description: strings.compliance.manualReviewNotice,
      };
    case "no_match":
      return {
        label: strings.faceMatch.couldNotConfirmTitle,
        tone: "danger",
        description: strings.faceMatch.couldNotConfirmDescription,
      };
    default:
      return { label: strings.faceMatch.pendingLabel, tone: "neutral", description: "" };
  }
}

// The identity engine's own stable failure_reason strings (see
// AfilianetFaceMatchEngine/FakeFaceMatchEngine in afilianet-api) --
// PROBE (selfie) vs REFERENCE (document portrait) failures are distinguished
// by an exact `_probe`/`_reference` suffix convention, never guessed.
export function isReferenceSideFailure(reason: string | null): boolean {
  return reason !== null && reason.endsWith("_reference");
}

/**
 * Phase 9D.4: `ambiguous_document_reference` is a genuine DEAD END for a
 * retry, unlike every other reference-side reason -- the identity document
 * is already `passed`/immutable, so no amount of retaking the selfie can
 * ever change which faces the engine detected in the ALREADY-CAPTURED
 * document image. The backend (afilianet-api's FaceMatchProcessingService)
 * now resolves this into Compliance's existing manual-review pathway
 * instead of leaving it a retryable technical failure (see
 * ComplianceStep.status ending up `passed` with the case routed to
 * `manual_review` -- the exact same mechanism a genuine biometric
 * `verdict: review` already uses). This app must never show a "Retake
 * selfie" loop for it.
 */
export function isReferenceInconclusive(reason: string | null): boolean {
  return reason === "ambiguous_document_reference";
}

export const REFERENCE_INCONCLUSIVE_COPY: { label: string; tone: BadgeTone; description: string } = {
  label: strings.faceMatch.referenceInconclusive.title,
  tone: "warning",
  description: strings.faceMatch.referenceInconclusive.description,
};

const PROBE_FAILURE_COPY: Record<string, string> = {
  no_face_probe: strings.faceMatch.probeFailures.noFace,
  multiple_faces_probe: strings.faceMatch.probeFailures.multipleFaces,
  face_too_small_probe: strings.faceMatch.probeFailures.faceTooSmall,
  image_decode_failed_probe: strings.faceMatch.probeFailures.imageDecodeFailed,
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
    return { message: strings.faceMatch.referenceSideFailure };
  }
  if (reason !== null && reason in PROBE_FAILURE_COPY) {
    return { message: PROBE_FAILURE_COPY[reason] };
  }
  if (reason !== null && ENGINE_UNAVAILABLE_REASONS.has(reason)) {
    return { message: strings.faceMatch.serviceUnavailable };
  }
  return { message: strings.faceMatch.genericError };
}
