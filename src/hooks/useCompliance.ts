import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { fetchMyCompliance } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

export function useCompliance() {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  return useApiQuery(scopedComplianceKey(["compliance", "me", activeOrganization?.id], assistedId), () => fetchMyCompliance(...assistedScopeArgs(assistedId)), {
    enabled: hasPersonalAffiliateAccess(activeOrganization),
  });
}
