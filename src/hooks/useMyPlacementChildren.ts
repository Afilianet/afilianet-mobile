import { fetchMyPlacementChildren } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMyPlacementChildren() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "placement-children", "me", activeOrganization?.id],
    (page) => fetchMyPlacementChildren(page),
    { enabled: Boolean(activeOrganization) },
  );
}
