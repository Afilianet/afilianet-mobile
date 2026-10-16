import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markPlatformNotificationRead } from "../api/endpoints";

/** Mirrors useMarkNotificationRead, minus the organization dimension. */
export function useMarkPlatformNotificationRead() {
  const queryClient = useQueryClient();

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["platform-notifications", "mine"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-notifications", "unread-count"] });
  }

  return useMutation({
    mutationFn: markPlatformNotificationRead,
    onSuccess: refresh,
    onError: refresh,
  });
}
