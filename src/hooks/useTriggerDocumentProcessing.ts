import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerDocumentProcessing } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";
import type { DocumentType } from "../types/api";

/**
 * Triggers an async document-processing attempt. On success, seeds the
 * document-result query directly with the returned `pending` attempt
 * (avoids waiting for a first poll to even see "pending") rather than only
 * invalidating.
 *
 * A 409 here means an attempt is already in progress for this step (e.g.
 * the screen was reopened mid-processing) -- rather than surface that as a
 * hard error, this refreshes the document-result query so the UI picks up
 * the existing in-flight attempt and starts polling it, same end state as
 * if this trigger had succeeded.
 */
export function useTriggerDocumentProcessing(stepId: string) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const queryKey = ["compliance", "document-result", orgId, stepId];

  return useMutation({
    mutationFn: (documentType: DocumentType) => triggerDocumentProcessing(stepId, documentType),
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
