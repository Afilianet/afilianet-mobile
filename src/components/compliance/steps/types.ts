import type { AttemptStepPayload, ComplianceStatus, ComplianceStep } from "../../../types/api";

/** Shared prop shape for every per-step-type component ComplianceStepCard dispatches to. */
export interface StepDetailProps {
  step: ComplianceStep;
  attempt: (payload: AttemptStepPayload) => void;
  isPending: boolean;
  /**
   * True when the step is reachable ahead of the case's current_step only
   * for its own processing flow (face_match, see stepOrder.ts): the generic
   * attempt endpoint and its development simulator must not be offered.
   */
  processingOnly?: boolean;
  /** False when the organization has KYC capture off (API #86): nothing new can be recorded. Defaults to true. */
  captureAvailable?: boolean;
  /** The case status from the same snapshot, when the step needs it to describe what happens next. */
  caseStatus?: ComplianceStatus;
}
