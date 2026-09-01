import type { BadgeTone } from "../../../design-system/theme";
import type { DocumentType, DocumentVerdict, EvidenceType } from "../../../types/api";

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
