import { fetchUnreadNotificationCount } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/** Always the backend's own count (GET /notifications/unread-count) -- never derived by counting loaded pages locally. */
export function useUnreadNotificationCount() {
  const { activeOrganization } = useOrganization();
  return useApiQuery(["notifications", "unread-count", activeOrganization?.id], fetchUnreadNotificationCount, {
    enabled: Boolean(activeOrganization),
  });
}
