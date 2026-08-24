import { fetchAffiliatePlacementChildren } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** `enabled` should be gated on the parent useAffiliateDetails() call succeeding -- no point firing a guaranteed-403 sub-request otherwise. */
export function useAffiliatePlacementChildren(affiliateId: string | undefined, enabled: boolean) {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "placement-children", "paged", activeOrganization?.id, affiliateId],
    (page) => fetchAffiliatePlacementChildren(affiliateId as string, page),
    { enabled: Boolean(activeOrganization) && Boolean(affiliateId) && enabled },
  );
}
