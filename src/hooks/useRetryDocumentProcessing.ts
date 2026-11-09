import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retryDocumentProcessing } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Runs the document engine again over the photos already stored (API #110).
 * On 202 the new `pending` result goes straight into the document-result
 * cache, so useDocumentResult starts polling it. Any refusal means the local
 * view is stale (another attempt in flight, the result changed, the cap was
 * reached, the person activated the account): the result and the case are
 * read again instead of retrying -- never an automatic loop.
 */
export function useRetryDocumentProcessing(stepId: string) {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const resultKey = scopedComplianceKey(["compliance", "document-result", orgId, stepId], assistedId);

  function refreshCase() {
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "me", orgId], assistedId) });
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "steps", orgId], assistedId) });
  }

  return useMutation({
    mutationFn: () => retryDocumentProcessing(stepId, ...assistedScopeArgs(assistedId)),
    onSuccess: (result) => {
      queryClient.setQueryData(resultKey, result);
      refreshCase();
    },
    onError: (error) => {
      if (!isApiError(error)) return;
      void queryClient.invalidateQueries({ queryKey: resultKey });
      refreshCase();
    },
  });
}
