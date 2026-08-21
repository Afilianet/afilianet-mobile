import { fetchMyCompliance } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useCompliance() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["compliance", "me", activeOrganization?.id], fetchMyCompliance, {
    enabled: Boolean(activeOrganization),
  });
}
