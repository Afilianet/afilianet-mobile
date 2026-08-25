import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestPayout } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Requesting a payout reserves funds without touching the ledger (see
 * afilianet-api's PayoutService docblock) -- but it DOES change what
 * useWallet/useWalletActivity/useMyPayouts/usePayoutEligibility should show
 * (a newly-reserved amount, a new payout row), so all four are invalidated
 * on success. The caller is responsible for generating and reusing a
 * stable idempotency_key across retries of the same logical attempt (see
 * the request screen) -- this hook doesn't generate one itself, since a
 * fresh mutation instance shouldn't decide when a "new attempt" starts.
 */
export function useRequestPayout() {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: requestPayout,
    onSuccess: (payout) => {
      if (!orgId) return;
      void queryClient.invalidateQueries({ queryKey: ["wallet", "me", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["wallet", "entries", orgId, payout.currency] });
      void queryClient.invalidateQueries({ queryKey: ["payouts", "mine", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["payouts", "eligibility", orgId, payout.currency] });
    },
  });
}
