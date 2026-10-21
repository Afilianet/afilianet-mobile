import { fetchMyPlacementChildren } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMyPlacementChildren() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "placement-children", "me", activeOrganization?.id],
    (page) => fetchMyPlacementChildren(page),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) },
  );
}
