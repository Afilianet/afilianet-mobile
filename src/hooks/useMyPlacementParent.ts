import { fetchMyPlacementParent } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

export function useMyPlacementParent() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "placement-parent", "me", activeOrganization?.id], fetchMyPlacementParent, {
    enabled: hasPersonalAffiliateAccess(activeOrganization),
  });
}
