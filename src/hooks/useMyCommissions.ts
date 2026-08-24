import { fetchMyCommissionsPage } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/**
 * The full, paginated commission history for the dedicated Commissions
 * screen. Distinct query key from useCommissions()'s ["commissions","mine",orgId]
 * (Home's flat "recent 5" preview) -- a regular useQuery and a
 * useInfiniteQuery must never share a key for the same data, since
 * react-query's cache entry shape differs between the two (same bug class
 * fixed for useSponsoredAffiliates vs useAffiliateSponsored in Phase 7B.3).
 * Both nest under the existing "commissions" domain root, so
 * OrganizationProvider's tenant-query invalidation already covers this one too.
 */
export function useMyCommissions() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["commissions", "mine", "paged", activeOrganization?.id],
    (page) => fetchMyCommissionsPage(page),
    { enabled: Boolean(activeOrganization) },
  );
}
