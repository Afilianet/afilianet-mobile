import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
import { fetchComplianceSteps } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

/**
 * Read-only -- there's no endpoint to submit/attempt a step (see
 * fetchComplianceSteps's docblock). Enabled only once a case exists so this
 * never fires its own needless 404 before /compliance/start has been
 * called -- callers should gate this on the case query having data.
 */
export function useComplianceSteps(enabled: boolean) {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  return useApiQuery(scopedComplianceKey(["compliance", "steps", activeOrganization?.id], assistedId), () => fetchComplianceSteps(...assistedScopeArgs(assistedId)), {
    enabled: hasPersonalAffiliateAccess(activeOrganization) && enabled,
  });
}
