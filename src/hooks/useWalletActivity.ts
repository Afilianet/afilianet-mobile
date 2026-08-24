import { fetchWalletActivity } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** Ledger activity for exactly one currency -- never combined across currencies. Nests under the existing "wallet" tenant-query domain. */
export function useWalletActivity(currency: string) {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["wallet", "entries", activeOrganization?.id, currency],
    (page) => fetchWalletActivity(currency, page),
    { enabled: Boolean(activeOrganization) && Boolean(currency) },
  );
}
