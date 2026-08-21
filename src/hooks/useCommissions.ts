import { fetchMyCommissions } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useCommissions() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["commissions", "mine", activeOrganization?.id], fetchMyCommissions, {
    enabled: Boolean(activeOrganization),
  });
}
