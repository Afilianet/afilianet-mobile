import { fetchMyInvitations } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/** First page only -- this is a compact summary section, not a paginated list (see the Network screen's "My invitations" section). */
export function useMyInvitations() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["affiliate", "invitations", "me", activeOrganization?.id], () => fetchMyInvitations(), {
    enabled: Boolean(activeOrganization),
  });
}
