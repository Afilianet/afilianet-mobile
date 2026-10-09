import type { ComplianceStep, ComplianceStepType } from "../../types/api";

/**
 * What the affiliate must redo after staff asked for a recapture. Today the
 * API (POST /compliance/cases/{case}/retry-liveness) only supports a
 * liveness recapture, takes no reason, and exposes no explicit flag: it
 * reopens the case to in_progress with current_step "biometric_liveness"
 * and that step back to `pending`, without resetting attempt_count. Those
 * existing fields are the only signal used here -- nothing is inferred
 * from fields the API does not return.
 *
 * Only "liveness" is ever returned: a selfie never substitutes for a
 * required liveness check, and the face_match step stays locked behind
 * liveness until the new AWS session completes (ComplianceStepCard).
 */
export type RecaptureRequest = { action: "liveness" };

export function recaptureRequest(currentStep: ComplianceStepType | string | null, steps: ComplianceStep[]): RecaptureRequest | null {
  if (currentStep !== "biometric_liveness") return null;
  const reopened = steps.some(
    (step) => step.step_type === "biometric_liveness" && step.status === "pending" && step.attempt_count > 0,
  );
  return reopened ? { action: "liveness" } : null;
}
