import { fetchMySponsor } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useMySponsor() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "sponsor", "me", activeOrganization?.id], fetchMySponsor, {
    enabled: Boolean(activeOrganization),
  });
}
