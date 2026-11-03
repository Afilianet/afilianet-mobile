import { fetchOrganizationAffiliates } from "../api/endpoints";
import { isOrganizationStaff } from "../state/membership";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/**
 * The active organization's affiliates (management view), optionally
 * filtered by a search term. Only requested for staff of that organization;
 * keyed by organization, so another organization's list is never shown.
 */
export function useOrganizationAffiliates(term = "") {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "organization-list", activeOrganization?.id, term],
    (page) => fetchOrganizationAffiliates(page, 20, term || undefined),
    { enabled: isOrganizationStaff(activeOrganization) },
  );
}
