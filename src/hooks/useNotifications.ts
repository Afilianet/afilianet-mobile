import { fetchNotifications } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** Newest-first, backend-paginated notification feed for the active organization. */
export function useNotifications() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(["notifications", "mine", activeOrganization?.id], (page) => fetchNotifications(page), {
    enabled: Boolean(activeOrganization),
  });
}
