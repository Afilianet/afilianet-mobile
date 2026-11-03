import { fetchMyInvitations } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

/** First page only -- this is a compact summary section, not a paginated list (see the Network screen's "My invitations" section). */
export function useMyInvitations() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "invitations", "me", activeOrganization?.id], () => fetchMyInvitations(), {
    enabled: hasPersonalAffiliateAccess(activeOrganization),
  });
}
