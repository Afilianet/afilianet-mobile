import type { BadgeTone } from "../../../design-system/theme";
import type { DocumentType, DocumentVerdict, EvidenceType, ProviderUnavailableReason } from "../../../types/api";

// DocumentRequirements.php's REQUIRED map, mirrored client-side purely to
// drive the capture checklist UI -- the backend independently enforces the
// same requirement at trigger time, this is never the source of truth.
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  mx_ine: "Mexican INE",
  passport: "Passport",
};

export const REQUIRED_EVIDENCE: Record<DocumentType, EvidenceType[]> = {
  mx_ine: ["id_document_front", "id_document_back"],
  passport: ["id_document_page"],
};

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  id_document_front: "Front",
  id_document_back: "Back",
  id_document_page: "Identity page",
  selfie: "Selfie",
};

// Every field name MxIneParser/PassportMrzParser actually emit
// (DOCUMENT_ENGINE.md sections F/G) -- an unrecognized field still renders
// (humanized fallback below), this only improves the label for known ones.
const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  paternal_last_name: "Paternal last name",
  maternal_last_name: "Maternal last name",
  date_of_birth: "Date of birth",
  curp: "CURP",
  elector_key: "Elector key",
  expiration_year: "Expiration year",
  surname: "Surname",
  given_names: "Given names",
  nationality: "Nationality",
  sex: "Sex",
  passport_number: "Passport number",
  expiration_date: "Expiration date",
  issuing_country: "Issuing country",
};

const DATE_FIELDS = new Set(["date_of_birth", "expiration_date"]);

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format guidance for the confirmation FORM's editable inputs (Phase
// 9C.2a) -- these mirror DocumentConfirmableFields::rulesFor() in
// afilianet-api (never invented independently), so a correction typed here
// is likely to pass server-side validation on the first try. An unlisted
// field renders with no helper text.
const FIELD_HELPER_TEXT: Record<string, string> = {
  date_of_birth: "Format: YYYY-MM-DD",
  expiration_date: "Format: YYYY-MM-DD",
  expiration_year: "4-digit year",
  curp: "18 characters",
  elector_key: "18 characters",
  sex: "M, F, or X",
  issuing_country: "3-letter code, e.g. MEX",
  nationality: "3-letter code, e.g. MEX",
};

export function confirmationFieldHelperText(name: string): string | undefined {
  return FIELD_HELPER_TEXT[name];
}

// Rendered in a monospaced field to match TextInput's existing convention
// for code-like values (CLABE/RFC/invitation codes) -- these are all
// fixed-format codes, not prose.
export const MONO_CONFIRMATION_FIELDS = new Set([
  "curp",
  "elector_key",
  "passport_number",
  "date_of_birth",
  "expiration_date",
  "expiration_year",
  "issuing_country",
  "nationality",
  "sex",
]);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * A plain YYYY-MM-DD string (both date_of_birth and expiration_date are
 * always this shape -- see MxIneParser/PassportMrzParser) formatted WITHOUT
 * going through `new Date(...)`/Intl -- that path interprets a date-only
 * string as UTC midnight, which can silently shift a birth date back one
 * day for any user west of UTC. Parsing the components directly avoids
 * that pitfall entirely for a field this sensitive to get right.
 */
function formatIsoDateLiteral(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  return monthName ? `${monthName} ${Number(day)}, ${year}` : value;
}

/** ISO date fields render human-readable; everything else (CURP, names, MRZ codes) renders as-is. */
export function fieldDisplayValue(name: string, value: string | null): string {
  if (value === null) return "—";
  if (DATE_FIELDS.has(name)) return formatIsoDateLiteral(value);
  return value;
}

export function verdictCopy(verdict: DocumentVerdict | null): { label: string; tone: BadgeTone; description: string } {
  switch (verdict) {
    case "pass":
      return { label: "Confirmed from document", tone: "success", description: "Your document checks passed." };
    case "review":
      return {
        label: "Please review",
        tone: "warning",
        description: "Your submission is under manual review. No action is needed from you right now.",
      };
    case "fail":
      return {
        label: "Needs correction",
        tone: "danger",
        description: "Your document couldn't be verified. You can retake the photo and try again.",
      };
    default:
      return { label: "Pending", tone: "neutral", description: "" };
  }
}

// The exact failure_reason strings DocumentProcessingService::markTechnicalFailure()
// persists (DOCUMENT_ENGINE.md section I, IDENTITY_ENGINE.md section H) --
// never shown verbatim to the user, always mapped through here.
const UNAVAILABLE_REASONS = new Set([
  "ocr_unavailable",
  "unreachable",
  "unauthorized",
  "timeout",
  "malformed_response",
  "engine_error",
]);

export function isUnavailableFailureReason(reason: string | null): boolean {
  return reason !== null && UNAVAILABLE_REASONS.has(reason);
}

export function friendlyFailureReason(reason: string | null): string {
  if (reason === "poor_image_quality") {
    return "This photo isn't clear enough to read. Retake it with better lighting, and make sure the whole document is visible and in focus.";
  }
  if (reason === "evidence_unavailable") {
    return "Something went wrong with your upload. Please retake the photo.";
  }
  if (isUnavailableFailureReason(reason)) {
    return "Document verification is temporarily unavailable. Please try again in a few minutes.";
  }
  return "Something went wrong while processing your document. Please try again.";
}

/**
 * Phase 9C.2a: maps the server-authoritative provider-visibility signal
 * (ComplianceStep.configured_provider/provider_actionable/
 * provider_unavailable_reason) to safe, generic copy -- never exposes a
 * service URL, secret/token, internal OCR class, container name, or stack
 * trace. `retryable` only true for the one genuinely transient reason
 * (engine_unavailable) -- everything else is a configuration state a
 * "retry" can't fix, so no retry action is offered for those.
 *
 * `featureLabel` (Phase 9D.3: this copy/component is shared across every
 * step-type provider gate, not document-capture-specific despite living in
 * this file -- see ProviderUnavailableState.tsx) names WHAT is unavailable
 * ("Document verification"/"Face verification"/...) so the message is
 * accurate for whichever step is actually showing it, never a generic
 * "document" claim bleeding into an unrelated step's UI.
 */
export function providerUnavailableCopy(
  configuredProvider: string | null,
  reason: ProviderUnavailableReason | null,
  featureLabel: string,
): { title: string; description: string; retryable: boolean } {
  if (reason === "engine_unavailable") {
    return {
      title: "Temporarily unavailable",
      description: `${featureLabel} is temporarily unavailable. Please try again in a few minutes.`,
      retryable: true,
    };
  }
  if (reason === "not_configured") {
    return {
      title: "Not set up yet",
      description: `${featureLabel} isn't set up for this organization yet.`,
      retryable: false,
    };
  }
  if (reason === "provider_misconfigured" || reason === "provider_not_implemented") {
    return {
      title: "Not available",
      description: `${featureLabel} isn't available for this organization right now.`,
      retryable: false,
    };
  }
  // configuredProvider is something this app has no dedicated UI for
  // (e.g. "fake" outside a dev/QA context, or a future provider) -- same
  // honest, non-alarming framing as the existing Incode message, never
  // implying anything is broken.
  return {
    title: "Different flow",
    description: `${featureLabel} for this organization uses a different flow.`,
    retryable: false,
  };
}

/**
 * Phase 9C.2a: which UI state a document-processing result maps to, layered
 * on top of DocumentProcessingStatus/DocumentVerdict/DocumentConfirmationStatus
 * -- these are UI mappings only, never new backend domain states
 * (confirmation_required/confirmation_status are read directly from the
 * backend, never inferred from confidence).
 *
 * This is the PRIMARY state for badge/heading purposes -- "review" wins over
 * "confirmation_required" when both are true (a review-verdict result can
 * still have confirmable fields; the review notice takes visual priority),
 * but the confirmation FORM itself renders independently whenever
 * confirmation_status is "pending" and verdict isn't "fail" (see
 * DocumentResultView) -- confirmation is never gated on which of these
 * primary states is showing.
 */
export type DocumentResultUiState = "processing" | "confirmation_required" | "confirmed" | "review" | "completed" | "failed";

export function documentResultUiState(result: {
  status: string;
  verdict: DocumentVerdict | null;
  confirmation_status: string;
}): DocumentResultUiState {
  if (result.status === "pending" || result.status === "processing") return "processing";
  if (result.status === "failed") return "failed";
  if (result.verdict === "review") return "review";
  if (result.confirmation_status === "pending") return "confirmation_required";
  if (result.confirmation_status === "confirmed") return "confirmed";
  return "completed";
}
