import { fetchMySponsor } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

export function useMySponsor() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "sponsor", "me", activeOrganization?.id], fetchMySponsor, {
    enabled: hasPersonalAffiliateAccess(activeOrganization),
  });
}
