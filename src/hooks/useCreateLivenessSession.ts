import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLivenessSession } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Mirrors useTriggerFaceMatchProcessing.ts's shape, but liveness session
 * creation has a simpler duplicate-start story than face match's dual-409
 * case: LivenessProcessingService::createSession() is itself idempotent
 * (reuses the latest non-terminal, not-yet-locally-expired session for the
 * step rather than erroring), so even a duplicate call that slips past the
 * capture flow's own synchronous in-flight guard just returns the SAME
 * session_id a second time -- never a second real AWS session, never a
 * 409 to handle here. On success, seeds the liveness-result query directly
 * with the returned session so the UI can move straight to it without
 * waiting for a first poll tick.
 */
export function useCreateLivenessSession(stepId: string) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const queryKey = ["compliance", "liveness-result", orgId, stepId];

  return useMutation({
    mutationFn: () => createLivenessSession(stepId),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKey, session);
    },
  });
}
