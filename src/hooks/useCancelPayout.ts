import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { cancelPayout } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";

function invalidatePayoutSurface(queryClient: QueryClient, orgId: string, currency: string) {
  void queryClient.invalidateQueries({ queryKey: ["wallet", "me", orgId] });
  void queryClient.invalidateQueries({ queryKey: ["wallet", "entries", orgId, currency] });
  void queryClient.invalidateQueries({ queryKey: ["payouts", "mine", orgId] });
  void queryClient.invalidateQueries({ queryKey: ["payouts", "eligibility", orgId, currency] });
}

/**
 * Cancelling releases the reservation useRequestPayout made, so the same
 * four queries it invalidates on success (wallet, wallet entries, payouts
 * history, payout eligibility) can go stale here too -- the released amount
 * is never computed client-side, only ever read back from the next backend
 * fetch. `currency` travels alongside `payoutId` in the mutation variables
 * (rather than only being read off the success response) because the 422
 * "already transitioned" race needs the same invalidation on failure, and
 * there's no response payload to read a currency from in that case.
 */
export function useCancelPayout() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: ({ payoutId }: { payoutId: string; currency: string }) => cancelPayout(payoutId),
    onSuccess: (payout) => {
      if (!orgId) return;
      invalidatePayoutSurface(queryClient, orgId, payout.currency);
    },
    onError: (error, variables) => {
      if (!orgId) return;
      // A payout that transitioned (processing/paid/failed/cancelled)
      // between the sheet opening and the cancel attempt renders as a 422 --
      // the fix is refreshing the stale data the sheet was built from, not
      // a generic error toast.
      if (isApiError(error) && error.kind === "validation") {
        invalidatePayoutSurface(queryClient, orgId, variables.currency);
      }
    },
  });
}
