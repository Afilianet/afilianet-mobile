import type { AttemptStepPayload, ComplianceStep } from "../../../types/api";

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
}
