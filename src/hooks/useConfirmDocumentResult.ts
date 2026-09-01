import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmDocumentResult } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Submits confirmed/corrected extracted fields for a step's latest
 * completed document-processing result. On success, seeds the document-
 * result query directly with the fresh (now confirmed) resource, and
 * invalidates compliance steps/case as a defensive refresh -- the backend
 * guarantees confirmation never actually changes ComplianceStep/Case state
 * (see DocumentProcessingService::confirmResult()'s docblock in
 * afilianet-api), so this never locally marks anything approved/passed,
 * it only keeps the client cache in sync.
 *
 * A 409 means the result was already confirmed with DIFFERENT values than
 * this submission (afilianet-api forbids changing an already-confirmed
 * value outright -- never silently overwritten, never versioned). Rather
 * than treat that as a generic error, this invalidates the document-result
 * query so the UI refetches and shows the ALREADY-confirmed (authoritative)
 * values instead of what the user just attempted to submit -- a hard stop,
 * never an auto-retry.
 */
export function useConfirmDocumentResult(stepId: string) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const resultQueryKey = ["compliance", "document-result", orgId, stepId];

  return useMutation({
    mutationFn: (fields: Record<string, string>) => confirmDocumentResult(stepId, fields),
    onSuccess: (result) => {
      queryClient.setQueryData(resultQueryKey, result);
      void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["compliance", "me", orgId] });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: resultQueryKey });
      }
    },
  });
}
