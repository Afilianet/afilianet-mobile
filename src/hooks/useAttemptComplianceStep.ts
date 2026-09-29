import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { attemptComplianceStep } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";
import type { AttemptStepPayload } from "../types/api";

/**
 * Backend alone decides the step's pass/fail, the case's next status
 * (including manual_review/approved), and affiliate activation -- this
 * hook only submits the attempt and refreshes what changed. On a 404
 * (foreign/stale step, e.g. a new case was started elsewhere since this
 * screen last loaded) or 422 (invalid state, e.g. the step already
 * resolved) the local view is known-stale, so the same refresh happens on
 * error too -- not just success.
 */
export function useAttemptComplianceStep() {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  function refreshComplianceSurface() {
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "me", orgId], assistedId) });
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "steps", orgId], assistedId) });
    void queryClient.invalidateQueries({ queryKey: ["affiliate", "me", orgId] });
  }

  return useMutation({
    mutationFn: ({ stepId, payload }: { stepId: string; payload: AttemptStepPayload }) =>
      attemptComplianceStep(stepId, payload, ...assistedScopeArgs(assistedId)),
    onSuccess: refreshComplianceSurface,
    onError: (error) => {
      if (isApiError(error) && (error.kind === "not_found" || error.kind === "validation")) {
        refreshComplianceSurface();
      }
    },
  });
}
