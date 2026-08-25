import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPayoutDestination } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

export function useCreatePayoutDestination() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: createPayoutDestination,
    onSuccess: () => {
      if (!orgId) return;
      void queryClient.invalidateQueries({ queryKey: ["payout-destinations", "mine", orgId] });
    },
  });
}
