import { fetchMyWallet } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useWallet() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["wallet", "me", activeOrganization?.id], fetchMyWallet, {
    enabled: Boolean(activeOrganization),
  });
}
