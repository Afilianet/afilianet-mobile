import { fetchMySponsored } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMySponsored() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "sponsored", "me", activeOrganization?.id],
    (page) => fetchMySponsored(page),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) },
  );
}
