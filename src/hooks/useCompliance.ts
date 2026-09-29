import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { fetchMyCompliance } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useCompliance() {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  return useApiQuery(scopedComplianceKey(["compliance", "me", activeOrganization?.id], assistedId), () => fetchMyCompliance(...assistedScopeArgs(assistedId)), {
    enabled: Boolean(activeOrganization),
  });
}
