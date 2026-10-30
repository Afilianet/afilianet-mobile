import { fetchPayoutDestinations } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

/** A flat "page 1" read, not an infinite query -- an affiliate's destination list is expected to be small. */
export function usePayoutDestinations() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["payout-destinations", "mine", activeOrganization?.id],
    () => fetchPayoutDestinations(),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) },
  );
}
