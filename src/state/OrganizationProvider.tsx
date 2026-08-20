import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { configureApiClient } from "../api/client";
import { isApiError, type ApiError } from "../api/errors";
import { fetchMyOrganizations } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { secureStorage } from "../services/storage";
import type { Organization } from "../types/api";
import { OrganizationContext, type OrganizationContextValue, type OrganizationStatus } from "./OrganizationContext";

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
      activeOrgIdRef.current = organizationId;
      setActiveOrganization(match);
      await secureStorage.set(ACTIVE_ORG_KEY, organizationId);
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
