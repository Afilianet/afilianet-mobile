import { fetchMyPayouts } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMyPayouts() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["payouts", "mine", activeOrganization?.id],
    (page) => fetchMyPayouts(page),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) },
  );
}
