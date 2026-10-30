import { fetchWalletActivity } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** Ledger activity for exactly one currency -- never combined across currencies. Nests under the existing "wallet" tenant-query domain. */
export function useWalletActivity(currency: string) {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["wallet", "entries", activeOrganization?.id, currency],
    (page) => fetchWalletActivity(currency, page),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) && Boolean(currency) },
  );
}
