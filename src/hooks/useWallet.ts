import { fetchMyWallet } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

export function useWallet(enabled = true) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["wallet", "me", activeOrganization?.id], fetchMyWallet, {
    enabled: enabled && hasPersonalAffiliateAccess(activeOrganization),
  });
}
