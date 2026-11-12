import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { queryClient } from "../api/queryClient";
import { configureApiClient } from "../api/client";
import { isApiError, type ApiError } from "../api/errors";
import { fetchMyOrganizations } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { secureStorage } from "../services/storage";
import { restoreOfflineOrganizations, saveOfflineOrganizations } from "../services/offlineSession";
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
  "assisted-enrollment",
  "assisted-enrollments",
  "assisted-local",
] as const;

const ACTIVE_ORG_KEY = "afilianet_active_organization_id";
/** Minimum time between two automatic reloads on returning to the foreground. */
export const FOREGROUND_RELOAD_MIN_MS = 60_000;

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState<OrganizationStatus>("idle");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const activeOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    configureApiClient({
      getOrganizationId: () => activeOrgIdRef.current,
      // A capture route answered 503 `kyc_unavailable` (API #86) for that
      // organization: stop offering capture there at once, before the next
      // list arrives. Only that organization is touched, and the next list
      // the server returns replaces this with its own value.
      onKycUnavailable: (organizationId) => {
        const refuse = (org: Organization) =>
          org.id === organizationId && org.identity_verification_available !== false ? { ...org, identity_verification_available: false } : org;
        setOrganizations((orgs) => (orgs.some((org) => refuse(org) !== org) ? orgs.map(refuse) : orgs));
        setActiveOrganization((active) => (active ? refuse(active) : active));
      },
      // Same for new assisted enrollments (503 assisted_enrollment_unavailable):
      // the entry and offline drafts stop at once for that organization only,
      // until the next list from the server says otherwise.
      onAssistedEnrollmentUnavailable: (organizationId) => {
        const refuse = (org: Organization) =>
          org.id === organizationId && org.assisted_enrollment_available !== false ? { ...org, assisted_enrollment_available: false } : org;
        setOrganizations((orgs) => (orgs.some((org) => refuse(org) !== org) ? orgs.map(refuse) : orgs));
        setActiveOrganization((active) => (active ? refuse(active) : active));
      },
    });
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

  // Picks the active organization for a fresh list: the stored one if still
  // there, the only one if there is exactly one, otherwise none.
  const applyList = useCallback(async (orgs: Organization[]) => {
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
  }, []);

  const lastFetchRef = useRef(0);
  const quietReloadRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (removedOrganizationId?: string) => {
    lastFetchRef.current = Date.now();
    if (removedOrganizationId) {
      await queryClient.cancelQueries();
      queryClient.clear();
      activeOrgIdRef.current = null;
      setActiveOrganization(null);
      await secureStorage.remove(ACTIVE_ORG_KEY);
      if (userId) {
        const saved = await restoreOfflineOrganizations(userId);
        await saveOfflineOrganizations(userId, (saved ?? []).filter(org => org.id !== removedOrganizationId));
      }
    }
    setStatus("loading");
    setError(null);
    try {
      let orgs: Organization[];
      try {
        orgs = await fetchMyOrganizations();
        if (userId) await saveOfflineOrganizations(userId, orgs).catch(() => undefined);
      } catch (cause) {
        if (!userId || !isApiError(cause) || !["offline", "timeout"].includes(cause.kind)) throw cause;
        const saved = await restoreOfflineOrganizations(userId);
        if (!saved) throw cause;
        orgs = saved;
      }
      orgs = orgs.filter(org => org.id !== removedOrganizationId);
      await applyList(orgs);

      setStatus("ready");
    } catch (err) {
      if (isApiError(err)) setError(err);
      setStatus("error");
    }
  }, [userId, applyList]);

  /**
   * A membership created elsewhere (Admin) after this session started shows
   * up without signing out. Same request and offline copy as `load`, but it
   * never shows a loading state and a failure (offline, timeout, server)
   * leaves the current list untouched. Nothing is created here: no
   * invitation, no profile, no personal /affiliates/me call.
   */
  const reloadOrganizations = useCallback(async () => {
    if (authStatus !== "signedIn") return;
    if (quietReloadRef.current) return quietReloadRef.current;
    lastFetchRef.current = Date.now();
    const run = (async () => {
      try {
        const orgs = await fetchMyOrganizations();
        if (userId) await saveOfflineOrganizations(userId, orgs).catch(() => undefined);
        await applyList(orgs);
        setError(null);
        setStatus("ready");
      } catch {
        // Keep what is shown; the next foreground or «Actualizar» tries again.
      } finally {
        quietReloadRef.current = null;
      }
    })();
    quietReloadRef.current = run;
    return run;
  }, [authStatus, userId, applyList]);

  // Back to the foreground: ask again, at most once per FOREGROUND_RELOAD_MIN_MS.
  useEffect(() => {
    if (authStatus !== "signedIn") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastFetchRef.current < FOREGROUND_RELOAD_MIN_MS) return;
      void reloadOrganizations();
    });
    return () => subscription.remove();
  }, [authStatus, reloadOrganizations]);

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
  }, [authStatus, load]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      status,
      organizations,
      activeOrganization,
      error,
      selectOrganization,
      refresh: load,
      reloadOrganizations,
    }),
    [status, organizations, activeOrganization, error, selectOrganization, load, reloadOrganizations],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
