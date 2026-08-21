import { fetchSponsoredAffiliates } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
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
    { enabled: Boolean(activeOrganization) && Boolean(affiliateId) },
  );
}
