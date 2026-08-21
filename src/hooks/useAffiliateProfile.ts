import { fetchMyAffiliateProfile } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

export function useAffiliateProfile() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "me", activeOrganization?.id], fetchMyAffiliateProfile, {
    enabled: Boolean(activeOrganization),
  });
}
