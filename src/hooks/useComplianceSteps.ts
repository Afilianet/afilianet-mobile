import { fetchComplianceSteps } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/**
 * Read-only -- there's no endpoint to submit/attempt a step (see
 * fetchComplianceSteps's docblock). Enabled only once a case exists so this
 * never fires its own needless 404 before /compliance/start has been
 * called -- callers should gate this on the case query having data.
 */
export function useComplianceSteps(enabled: boolean) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["compliance", "steps", activeOrganization?.id], fetchComplianceSteps, {
    enabled: Boolean(activeOrganization) && enabled,
  });
}
