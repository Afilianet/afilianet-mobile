import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { queryClient } from "../api/queryClient";
import { fetchMe, fetchMyAffiliateProfile, fetchMyOrganizations, signIn as signInRequest } from "../api/endpoints";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth, type AuthContextValue } from "../auth/AuthContext";
import { useAffiliateProfile } from "../hooks/useAffiliateProfile";
import { OrganizationProvider } from "./OrganizationProvider";
import { useOrganization, type OrganizationContextValue } from "./OrganizationContext";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("../api/endpoints", () => ({
  fetchMe: jest.fn(),
  signIn: jest.fn(),
  signOutRequest: jest.fn().mockResolvedValue(undefined),
  fetchMyOrganizations: jest.fn(),
  fetchMyAffiliateProfile: jest.fn(),
}));

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockedFetchMe = fetchMe as jest.Mock;
const mockedSignIn = signInRequest as jest.Mock;
const mockedFetchMyOrganizations = fetchMyOrganizations as jest.Mock;
const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;

let authValue: AuthContextValue;
let orgValue: OrganizationContextValue;

function Capture() {
  const auth = useAuth();
  const org = useOrganization();
  useEffect(() => {
    authValue = auth;
    orgValue = org;
  });
  return null;
}

async function renderApp() {
  await act(async () => {
    await render(
      <AuthProvider>
        <OrganizationProvider>
          <Capture />
        </OrganizationProvider>
      </AuthProvider>,
    );
  });
  await waitFor(() => expect(authValue.status).not.toBe("loading"));
}

let affiliateValue: ReturnType<typeof useAffiliateProfile> | undefined;

function AffiliateCapture() {
  const affiliate = useAffiliateProfile();
  useEffect(() => {
    affiliateValue = affiliate;
  });
  return null;
}

async function renderAppWithAffiliateQuery() {
  await act(async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrganizationProvider>
            <Capture />
            <AffiliateCapture />
          </OrganizationProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
  await waitFor(() => expect(authValue.status).not.toBe("loading"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
  queryClient.clear();
});

// This file renders against the app's shared singleton QueryClient (see
// api/queryClient.ts), not a per-test instance, because it exercises real
// cross-query invalidation behavior. `beforeEach`'s `clear()` prevents one
// test's cache from leaking into the next, but the *last* test's cache --
// and the query garbage-collection timers that come with it -- would
// otherwise sit on the singleton (and therefore on this worker's event
// loop) until the process exits. Clearing again after the last test closes
// that gap instead of leaving it for --forceExit to paper over.
afterAll(() => {
  queryClient.clear();
});

const ORG = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "owner",
  my_membership_status: "active",
};

const ORG_A = { ...ORG, id: "org-a", name: "Org A" };
const ORG_B = { ...ORG, id: "org-b", name: "Org B" };

const AFFILIATE_A = {
  id: "aff-a",
  affiliate_code: "AAA111",
  status: "active",
  joined_at: null,
  activated_at: null,
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

const AFFILIATE_B = {
  ...AFFILIATE_A,
  id: "aff-b",
  affiliate_code: "BBB222",
};

describe("organization initialization after login", () => {
  it("auto-selects the organization when the user belongs to exactly one", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG]);

    await renderApp();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    await waitFor(() => expect(orgValue.status).toBe("ready"));
    expect(orgValue.activeOrganization?.id).toBe("org-1");
  });

  it("clears organization state on logout", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG]);

    await renderApp();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });
    await waitFor(() => expect(orgValue.activeOrganization?.id).toBe("org-1"));

    await act(async () => {
      await authValue.signOut();
    });

    await waitFor(() => expect(orgValue.status).toBe("idle"));
    expect(orgValue.activeOrganization).toBeNull();
    expect(orgValue.organizations).toHaveLength(0);
  });
});

describe("organization switching and tenant query isolation", () => {
  it("does not show Org A's data after switching to Org B", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG_A, ORG_B]);
    mockedFetchMyAffiliateProfile.mockResolvedValueOnce(AFFILIATE_A).mockResolvedValueOnce(AFFILIATE_B);

    await renderAppWithAffiliateQuery();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    // Two orgs -> no auto-select. Choose Org A first.
    await act(async () => {
      await orgValue.selectOrganization("org-a");
    });
    await waitFor(() => expect(affiliateValue?.data?.affiliate_code).toBe("AAA111"));
    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      await orgValue.selectOrganization("org-b");
    });
    await waitFor(() => expect(affiliateValue?.data?.affiliate_code).toBe("BBB222"));

    expect(affiliateValue?.data?.affiliate_code).not.toBe("AAA111");
    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(2);
  });

  it("invalidates tenant-scoped query roots when switching organizations", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG_A, ORG_B]);
    mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE_A);

    await renderAppWithAffiliateQuery();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });
    await act(async () => {
      await orgValue.selectOrganization("org-a");
    });

    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    invalidateSpy.mockClear();

    await act(async () => {
      await orgValue.selectOrganization("org-b");
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(7);

    type Predicate = (query: { queryKey: unknown[] }) => boolean;
    const predicates = invalidateSpy.mock.calls.map(
      ([options]) => (options as unknown as { predicate: Predicate }).predicate,
    );

    for (const domain of [
      "affiliate",
      "compliance",
      "commissions",
      "wallet",
      "payouts",
      "payout-destinations",
      "notifications",
    ]) {
      // Every domain's cached data for the org we just left (org-a) should be
      // matched by exactly one of the invalidation calls...
      const matchesOldOrg = predicates.some((predicate) => predicate({ queryKey: [domain, "me", "org-a"] }));
      expect(matchesOldOrg).toBe(true);
      // ...and none of them should match the org we just switched to (org-b),
      // which is still actively observed -- that would trigger a redundant
      // duplicate fetch racing the new query's own initial fetch.
      const matchesNewOrg = predicates.some((predicate) => predicate({ queryKey: [domain, "me", "org-b"] }));
      expect(matchesNewOrg).toBe(false);
    }

    invalidateSpy.mockRestore();
  });
});
