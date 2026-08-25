import { fetchPayoutDestinations } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/** A flat "page 1" read, not an infinite query -- an affiliate's destination list is expected to be small. */
export function usePayoutDestinations() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["payout-destinations", "mine", activeOrganization?.id],
    () => fetchPayoutDestinations(),
    { enabled: Boolean(activeOrganization) },
  );
}
