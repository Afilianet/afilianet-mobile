import { fetchSponsoredAffiliates } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

/**
 * A lightweight preview of directly-sponsored affiliates -- not the full
 * network tree. Needs the caller's own affiliate id (from
 * useAffiliateProfile()) since there's no self-scoped "/me/sponsored" route.
 */
export function useSponsoredAffiliates(affiliateId: string | undefined, perPage = 5) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["affiliate", "sponsored", activeOrganization?.id, affiliateId],
    () => fetchSponsoredAffiliates(affiliateId as string, perPage),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) && Boolean(affiliateId) },
  );
}
