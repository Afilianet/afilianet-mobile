import { fetchPlatformNotifications } from "../api/endpoints";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** Newest-first, backend-paginated platform-wide notification feed -
 * reachable regardless of whether the caller currently belongs to any
 * organization at all (mirrors useNotifications, minus org-gating). */
export function usePlatformNotifications() {
  return useApiInfiniteQuery(["platform-notifications", "mine"], (page) => fetchPlatformNotifications(page));
}
