import { fetchPlatformUnreadNotificationCount } from "../api/endpoints";
import { useApiQuery } from "./useApiQuery";

/** Always the backend's own count -- never derived locally (mirrors useUnreadNotificationCount). */
export function usePlatformUnreadNotificationCount() {
  return useApiQuery(["platform-notifications", "unread-count"], fetchPlatformUnreadNotificationCount);
}
