import { fetchMyAffiliateProfile, fetchMyCommissions, fetchMyCompliance, fetchMyWallet } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiQuery } from "./useApiQuery";

/**
 * Backs the Home dashboard cards. Every query is org-scoped (the api client
 * attaches X-Organization-ID from OrganizationContext) and disabled until an
 * organization is selected.
 */
export function useHomeDashboard() {
  const { activeOrganization } = useOrganization();
  const enabled = Boolean(activeOrganization);
  const orgId = activeOrganization?.id;

  const affiliate = useApiQuery(["affiliate", "me", orgId], fetchMyAffiliateProfile, { enabled });
  const wallet = useApiQuery(["wallet", "me", orgId], fetchMyWallet, { enabled });
  const commissions = useApiQuery(["commissions", "mine", orgId], fetchMyCommissions, { enabled });
  const compliance = useApiQuery(["compliance", "me", orgId], fetchMyCompliance, { enabled });

  return { affiliate, wallet, commissions, compliance };
}
