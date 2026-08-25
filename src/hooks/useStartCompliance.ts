import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startCompliance } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Starting a case is the only compliance action this app can currently
 * perform over HTTP (see startCompliance's docblock) -- invalidates the
 * case and steps queries so the newly-created case and its required steps
 * show up on the next render without a manual refresh.
 */
export function useStartCompliance() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: startCompliance,
    onSuccess: () => {
      if (!orgId) return;
      void queryClient.invalidateQueries({ queryKey: ["compliance", "me", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", orgId] });
    },
  });
}
