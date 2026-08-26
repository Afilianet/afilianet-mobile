import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markNotificationRead } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Idempotent server-side (repeated reads are always safe -- see
 * markNotificationRead's docblock). Refreshes the feed and unread count on
 * BOTH success and failure: a failed attempt still means the local
 * read-state view could be stale, and the caller is expected to navigate
 * regardless of whether this mutation itself succeeded (a read-mutation
 * failure must never block opening an otherwise-valid notification).
 */
export function useMarkNotificationRead() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  function refresh() {
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: ["notifications", "mine", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", orgId] });
  }

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
    onError: refresh,
  });
}
