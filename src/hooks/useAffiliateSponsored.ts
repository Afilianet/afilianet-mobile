import { fetchAffiliateSponsored } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/**
 * `enabled` should be gated on the parent useAffiliateDetails() call
 * succeeding -- no point firing a guaranteed-403 sub-request otherwise.
 *
 * Query key deliberately distinct from useSponsoredAffiliates's
 * ["affiliate", "sponsored", orgId, affiliateId] -- that hook is a flat
 * useQuery preview (Home's small fixed-page list), this is a paginated
 * useInfiniteQuery for the same affiliate/endpoint; sharing a key between a
 * regular query and an infinite query for the same data would corrupt
 * whichever one reads the cache entry the other one wrote.
 */
export function useAffiliateSponsored(affiliateId: string | undefined, enabled: boolean) {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "sponsored", "paged", activeOrganization?.id, affiliateId],
    (page) => fetchAffiliateSponsored(affiliateId as string, page),
    { enabled: Boolean(activeOrganization) && Boolean(affiliateId) && enabled },
  );
}
