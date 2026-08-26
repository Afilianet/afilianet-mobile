import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markAllNotificationsRead } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

export function useMarkAllNotificationsRead() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      if (!orgId) return;
      void queryClient.invalidateQueries({ queryKey: ["notifications", "mine", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", orgId] });
    },
  });
}
