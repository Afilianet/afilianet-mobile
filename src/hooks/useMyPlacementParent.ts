import { fetchMyPlacementParent } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useMyPlacementParent() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "placement-parent", "me", activeOrganization?.id], fetchMyPlacementParent, {
    enabled: Boolean(activeOrganization),
  });
}
