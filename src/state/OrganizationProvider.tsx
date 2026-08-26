import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { queryClient } from "../api/queryClient";
import { configureApiClient } from "../api/client";
import { isApiError, type ApiError } from "../api/errors";
import { fetchMyOrganizations } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { secureStorage } from "../services/storage";
import type { Organization } from "../types/api";
import { OrganizationContext, type OrganizationContextValue, type OrganizationStatus } from "./OrganizationContext";

// Root keys of every tenant-scoped React Query hook (useAffiliateProfile,
// useCompliance, useCommissions, useWallet, useSponsoredAffiliates,
// useMyPayouts, usePayoutDestinations, usePayoutEligibility). Query
// keys already include the org id, so switching orgs is a cache-miss on its
// own -- this invalidation is a second, explicit safety net so no stale
// Org A data can linger in the cache. It targets the PREVIOUS org's id
// specifically (via a predicate, since key shapes vary) rather than the bare
// domain root -- a bare-root invalidation would also match the org just
// switched *to*, which is still actively observed, and would trigger a
// redundant duplicate fetch racing the new query's own initial fetch.
const TENANT_QUERY_DOMAINS = [
  "affiliate",
  "compliance",
  "commissions",
  "wallet",
  "payouts",
  "payout-destinations",
  "notifications",
] as const;

const ACTIVE_ORG_KEY = "afilianet_active_organization_id";

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<OrganizationStatus>("idle");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const activeOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    configureApiClient({ getOrganizationId: () => activeOrgIdRef.current });
  }, []);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      const match = organizations.find((org) => org.id === organizationId);
      if (!match) return;
      const previousOrgId = activeOrgIdRef.current;
      const isSwitchingOrg = previousOrgId !== null && previousOrgId !== organizationId;
      activeOrgIdRef.current = organizationId;
      setActiveOrganization(match);
      await secureStorage.set(ACTIVE_ORG_KEY, organizationId);
      if (isSwitchingOrg) {
        for (const domain of TENANT_QUERY_DOMAINS) {
          // refetchType: "none" -- this call's only job is marking the
          // previous org's cache stale. The new org's data already fetches
          // on its own via the query-key change (enabled + new org id);
          // letting this invalidation refetch anything risks a race against
          // that natural fetch (observed in testing: it can fire an extra,
          // unnecessary request right as the org switch is in flight).
          void queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === domain && query.queryKey.includes(previousOrgId),
            refetchType: "none",
          });
        }
      }
    },
    [organizations],
  );

  async function load() {
    setStatus("loading");
    setError(null);
    try {
      const orgs = await fetchMyOrganizations();
      setOrganizations(orgs);

      const storedId = await secureStorage.get(ACTIVE_ORG_KEY);
      const restored = storedId ? orgs.find((org) => org.id === storedId) : undefined;

      if (restored) {
        activeOrgIdRef.current = restored.id;
        setActiveOrganization(restored);
      } else if (orgs.length === 1) {
        activeOrgIdRef.current = orgs[0].id;
        setActiveOrganization(orgs[0]);
        await secureStorage.set(ACTIVE_ORG_KEY, orgs[0].id);
      } else {
        activeOrgIdRef.current = null;
        setActiveOrganization(null);
      }

      setStatus("ready");
    } catch (err) {
      if (isApiError(err)) setError(err);
      setStatus("error");
    }
  }

  useEffect(() => {
    void (async () => {
      if (authStatus === "signedIn") {
        await load();
      } else if (authStatus === "signedOut") {
        activeOrgIdRef.current = null;
        setOrganizations([]);
        setActiveOrganization(null);
        setError(null);
        setStatus("idle");
        await secureStorage.remove(ACTIVE_ORG_KEY);
      }
    })();
  }, [authStatus]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      status,
      organizations,
      activeOrganization,
      error,
      selectOrganization,
      refresh: load,
    }),
    [status, organizations, activeOrganization, error, selectOrganization],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
