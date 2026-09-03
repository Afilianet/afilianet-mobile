import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerFaceMatchProcessing } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Mirrors useTriggerDocumentProcessing.ts exactly. On success, seeds the
 * face-match-result query directly with the returned `pending` attempt.
 *
 * A 409 here can mean one of TWO different things (see
 * FaceMatchProcessingException in afilianet-api): an attempt already in
 * progress for this step (the same "duplicate submission" recovery
 * document processing already established -- refresh the result query so
 * the UI picks up the existing in-flight attempt), OR that no completed
 * identity-document result exists yet to source a reference portrait from
 * (a genuinely different, user-actionable state). Invalidating on ANY 409
 * is always safe here (worst case, a harmless extra refetch of "no result
 * yet"); deciding WHAT TO TELL THE USER for each case is deliberately left
 * to the caller (FaceMatchCaptureFlow), which can distinguish them from the
 * error message -- this hook never swallows the error.
 */
export function useTriggerFaceMatchProcessing(stepId: string) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const queryKey = ["compliance", "face-match-result", orgId, stepId];

  return useMutation({
    mutationFn: () => triggerFaceMatchProcessing(stepId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
