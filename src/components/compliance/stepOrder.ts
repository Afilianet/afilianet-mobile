import type { ComplianceStep } from "../../types/api";
import { recaptureRequest } from "./recaptureRequest";

/**
 * How a compliance step card may be used given the case's enforced order.
 *
 * - "current": the step is the case's current_step (or already resolved):
 *   its own UI, including the generic attempt endpoint, is reachable.
 * - "processing-only": face_match ahead of its turn. afilianet-api #61's
 *   FaceMatchProcessingService::trigger() is deliberately NOT gated on
 *   current_step -- it only needs an Afilianet, actionable provider and a
 *   completed identity_document processing result as the portrait source
 *   (docs/identity/FACE_MATCH_INTEGRATION.md section E). The result is
 *   applied to the step only once face_match becomes current, and the case
 *   still cannot be approved before liveness passes. Only the selfie
 *   upload + processing flow is offered; the generic
 *   POST /compliance/steps/{step}/attempt stays locked, since that one
 *   does resolve the step and is strictly sequential.
 * - "locked": any other unresolved step that is not current.
 *
 * The case's current_step is the first pending/failed step in creation
 * order (ComplianceService::refreshCurrentStep()), so a resolved
 * identity_document here is the client-visible proof that its processing
 * completed. A staff liveness recapture keeps face_match locked: the new
 * comparison is triggered from the new liveness frame, and a manual
 * selfie would never be bound to it (see recaptureRequest.ts).
 */
export type StepAccess = "current" | "processing-only" | "locked";

export function stepAccess(step: ComplianceStep, currentStep: string | null, steps: readonly ComplianceStep[]): StepAccess {
  if (isResolved(step) || currentStep === step.step_type) return "current";
  if (step.step_type !== "face_match") return "locked";
  if (step.configured_provider !== "afilianet" || !step.provider_actionable) return "locked";
  const identityDocument = steps.find((candidate) => candidate.step_type === "identity_document");
  if (!identityDocument || !isResolved(identityDocument)) return "locked";
  if (recaptureRequest(currentStep, [...steps])) return "locked";
  return "processing-only";
}

function isResolved(step: ComplianceStep): boolean {
  return step.status === "passed" || step.status === "skipped";
}
