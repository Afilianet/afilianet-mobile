import { fetchAffiliateDetails } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/**
 * Drilling into a specific affiliate's profile. Expect a 403 for the common
 * case of a plain affiliate opening someone other than themselves -- see
 * fetchAffiliateDetails's comment. Callers should render ForbiddenState for
 * that case, not treat it as a generic failure.
 */
export function useAffiliateDetails(affiliateId: string | undefined) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["affiliate", "detail", activeOrganization?.id, affiliateId],
    () => fetchAffiliateDetails(affiliateId as string),
    { enabled: Boolean(activeOrganization) && Boolean(affiliateId) },
  );
}
