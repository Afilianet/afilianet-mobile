import { fetchPayoutEligibility } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import { useApiQuery } from "./useApiQuery";

/** The backend's own computed eligible_balance -- never re-derived client-side. Keyed per currency so switching currencies never shows a stale figure. */
export function usePayoutEligibility(currency: string | undefined) {
  const { activeOrganization } = useOrganization();
  return useApiQuery(
    ["payouts", "eligibility", activeOrganization?.id, currency],
    () => fetchPayoutEligibility(currency as string),
    { enabled: hasPersonalAffiliateAccess(activeOrganization) && Boolean(currency) },
  );
}
