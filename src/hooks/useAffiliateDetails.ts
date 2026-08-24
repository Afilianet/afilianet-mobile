import { fetchAffiliateDetails } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/**
 * Drilling into a specific affiliate's profile. Succeeds for the viewer's
 * own downline (sponsor or placement descendants, any depth) as well as
 * org owner/admin/manager viewing anyone -- see fetchAffiliateDetails's
 * comment. Still 403s for siblings/unrelated affiliates/ancestors; callers
 * should render ForbiddenState for that case, not treat it as a generic
 * failure.
 */
export function useAffiliateDetails(affiliateId: string | undefined) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["affiliate", "detail", activeOrganization?.id, affiliateId],
    () => fetchAffiliateDetails(affiliateId as string),
    { enabled: Boolean(activeOrganization) && Boolean(affiliateId) },
  );
}
