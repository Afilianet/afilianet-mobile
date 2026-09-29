import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startCompliance } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Starting a case is the only compliance action this app can currently
 * perform over HTTP (see startCompliance's docblock) -- invalidates the
 * case and steps queries so the newly-created case and its required steps
 * show up on the next render without a manual refresh.
 */
export function useStartCompliance() {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: () => startCompliance(...assistedScopeArgs(assistedId)),
    onSuccess: () => {
      if (!orgId) return;
      void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "me", orgId], assistedId) });
      void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "steps", orgId], assistedId) });
    },
  });
}
