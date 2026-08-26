import type { AttemptStepPayload, ComplianceStep } from "../../../types/api";

/** Shared prop shape for every per-step-type component ComplianceStepCard dispatches to. */
export interface StepDetailProps {
  step: ComplianceStep;
  attempt: (payload: AttemptStepPayload) => void;
  isPending: boolean;
}
