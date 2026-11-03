import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markAllPlatformNotificationsRead } from "../api/endpoints";

/** Mirrors useMarkAllNotificationsRead, minus the organization dimension. */
export function useMarkAllPlatformNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllPlatformNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-notifications", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-notifications", "unread-count"] });
    },
  });
}
