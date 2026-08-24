import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../../api/errors";
import {
  fetchMyAffiliateProfile,
  fetchMyCommissions,
  fetchMyCompliance,
  fetchMyWallet,
  fetchSponsoredAffiliates,
} from "../../../api/endpoints";
import { AuthContext, type AuthContextValue } from "../../../auth/AuthContext";
import { OrganizationContext, type OrganizationContextValue } from "../../../state/OrganizationContext";
import type { AffiliateProfile, Commission, ComplianceCase, Organization, User, WalletSummary } from "../../../types/api";
import HomeScreen from "../../../app/(app)/index";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  fetchMyCommissions: jest.fn(),
  fetchMyWallet: jest.fn(),
  fetchSponsoredAffiliates: jest.fn(),
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedFetchMyCommissions = fetchMyCommissions as jest.Mock;
const mockedFetchMyWallet = fetchMyWallet as jest.Mock;
const mockedFetchSponsoredAffiliates = fetchSponsoredAffiliates as jest.Mock;

const USER: User = {
  id: "user-1",
  first_name: "Jordan",
  last_name: "Lee",
  email: "jordan@example.com",
  phone: null,
  status: "active",
  email_verified_at: null,
  phone_verified_at: null,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const ORG: Organization = {
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

const ORG_2: Organization = { ...ORG, id: "org-2", name: "Beta Org" };

const ACTIVE_AFFILIATE: AffiliateProfile = {
  id: "aff-1",
  affiliate_code: "AFF100",
  status: "active",
  sponsor: null,
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: "2026-01-02T00:00:00Z",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

const PENDING_AFFILIATE: AffiliateProfile = { ...ACTIVE_AFFILIATE, status: "pending", activated_at: null };

const EMPTY_SPONSORED = { data: [], meta: { total: 0 } };

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "signedIn", user: USER, error: null, signIn: jest.fn(), signOut: jest.fn(), ...overrides };
}

function orgValue(overrides: Partial<OrganizationContextValue> = {}): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG],
    activeOrganization: ORG,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

// A local client (not the app's shared singleton) with retries disabled --
// nothing here exercises OrganizationProvider's invalidation, and disabling
// retries avoids real exponential-backoff delays when a test deliberately
// simulates a server/offline error.
let queryClient: QueryClient;

async function renderHome(options: { auth?: Partial<AuthContextValue>; org?: Partial<OrganizationContextValue> } = {}) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue(options.auth)}>
          <OrganizationContext.Provider value={orgValue(options.org)}>
            <HomeScreen />
          </OrganizationContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(ACTIVE_AFFILIATE);
  mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
  mockedFetchMyCommissions.mockResolvedValue([]);
  mockedFetchMyWallet.mockResolvedValue([]);
  mockedFetchSponsoredAffiliates.mockResolvedValue(EMPTY_SPONSORED);
});

// The "resilience"/"offline" tests below deliberately let useApiQuery's real
// retry policy run (it's set per-query, so this client's own `retry: false`
// default doesn't override it -- see useApiQuery.ts), producing genuine
// setTimeout-driven exponential backoff. Clearing the client immediately
// after each test cancels any retry/gc timers tied to it instead of leaving
// them to fire on their own or pile up as open handles across this file's
// 15 tests.
afterEach(() => {
  queryClient.clear();
});

describe("Home: header", () => {
  it("greets the user by first name and shows the active organization", async () => {
    const { findByText } = await renderHome();
    expect(await findByText("Hi, Jordan")).toBeTruthy();
    expect(await findByText("Acme")).toBeTruthy();
  });

  it("shows an organization switcher entry point with multiple organizations", async () => {
    const { findByText, getByText } = await renderHome({ org: { organizations: [ORG, ORG_2] } });
    await findByText("Acme");
    fireEvent.press(getByText("Acme"));
    expect(mockRouter.push).toHaveBeenCalledWith("/organization-picker");
  });

  it("does not show a switcher when there's only one organization", async () => {
    const { findByText } = await renderHome();
    await findByText("Acme");
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe("Home: affiliate status", () => {
  it("shows an active affiliate's code, status, and activation date", async () => {
    const { findByText } = await renderHome();
    expect(await findByText("Active")).toBeTruthy();
    expect(await findByText("AFF100")).toBeTruthy();
    expect(await findByText(/Joined/)).toBeTruthy();
    expect(await findByText(/Activated/)).toBeTruthy();
  });

  it("shows a pending affiliate as not yet activated", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(PENDING_AFFILIATE);
    const { findByText } = await renderHome();
    expect(await findByText("Pending")).toBeTruthy();
    expect(await findByText("Not yet activated")).toBeTruthy();
  });

  it("shows an enrollment message instead of crashing when there's no affiliate profile", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText } = await renderHome();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
  });
});

describe("Home: compliance", () => {
  it("shows a not-started state with a CTA when there's no compliance case yet", async () => {
    const { findByText } = await renderHome();
    expect(await findByText("Not started")).toBeTruthy();
    expect(await findByText("Start verification")).toBeTruthy();
  });

  it("shows approved with no CTA", async () => {
    mockedFetchMyCompliance.mockResolvedValue({
      id: "case-1",
      status: "approved",
      current_step: null,
      risk_level: null,
      started_at: null,
      submitted_at: null,
      reviewed_at: null,
      approved_at: "2026-01-05T00:00:00Z",
      rejected_at: null,
      expires_at: null,
      rejection_reason: null,
      created_at: "2026-01-01T00:00:00Z",
    } satisfies ComplianceCase);
    const { findByText, queryByText } = await renderHome();
    expect(await findByText("Approved")).toBeTruthy();
    expect(queryByText("Continue verification")).toBeNull();
  });

  it("shows rejected with a CTA to continue/retry", async () => {
    mockedFetchMyCompliance.mockResolvedValue({
      id: "case-1",
      status: "rejected",
      current_step: null,
      risk_level: null,
      started_at: null,
      submitted_at: null,
      reviewed_at: null,
      approved_at: null,
      rejected_at: "2026-01-05T00:00:00Z",
      expires_at: null,
      rejection_reason: "Document unclear",
      created_at: "2026-01-01T00:00:00Z",
    } satisfies ComplianceCase);
    const { findByText } = await renderHome();
    expect(await findByText("Rejected")).toBeTruthy();
    expect(await findByText("Continue verification")).toBeTruthy();
  });
});

describe("Home: commissions", () => {
  const baseCommission: Commission = {
    id: "c-1",
    type: "direct_sale",
    network_level: 0,
    basis_amount: "100.00",
    rate_basis_points: 1000,
    amount: "10.00",
    currency: "USD",
    status: "earned",
    calculated_at: "2026-01-01T00:00:00Z",
    reversed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("shows an empty state when there are no commissions", async () => {
    const { findByText } = await renderHome();
    expect(await findByText("No commissions yet")).toBeTruthy();
  });

  it("renders distinct badges for earned/void/reversed commissions", async () => {
    mockedFetchMyCommissions.mockResolvedValue([
      { ...baseCommission, id: "c-1", status: "earned" },
      { ...baseCommission, id: "c-2", status: "void" },
      { ...baseCommission, id: "c-3", status: "reversed" },
    ]);
    const { findByText } = await renderHome();
    expect(await findByText("Earned")).toBeTruthy();
    expect(await findByText("Void")).toBeTruthy();
    expect(await findByText("Reversed")).toBeTruthy();
  });

  it("navigates to the Commissions screen from the summary", async () => {
    mockedFetchMyCommissions.mockResolvedValue([baseCommission]);
    const { findByText } = await renderHome();
    const link = await findByText("View all commissions");
    fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenCalledWith("/commissions");
  });
});

describe("Home: wallet", () => {
  it("shows a single currency's pending/available balances", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "100.00", available_balance: "250.00" },
    ] satisfies WalletSummary[]);
    const { findByText } = await renderHome();
    expect(await findByText("USD")).toBeTruthy();
    expect(await findByText(/100\.00/)).toBeTruthy();
    expect(await findByText(/250\.00/)).toBeTruthy();
  });

  it("shows multiple currencies as separate blocks, never combined", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "100.00", available_balance: "250.00" },
      { currency: "MXN", status: "active", pending_balance: "1200.00", available_balance: "3500.00" },
    ] satisfies WalletSummary[]);
    const { findByText } = await renderHome();
    expect(await findByText("USD")).toBeTruthy();
    expect(await findByText("MXN")).toBeTruthy();
    expect(await findByText(/250\.00/)).toBeTruthy();
    expect(await findByText(/3,500\.00/)).toBeTruthy();
  });

  it("navigates to the Wallet screen from the summary", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "100.00", available_balance: "250.00" },
    ] satisfies WalletSummary[]);
    const { findByText } = await renderHome();
    const link = await findByText("View wallet");
    fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenCalledWith("/(app)/wallet");
  });
});

describe("Home: resilience", () => {
  // "server"/"offline" are retryable kinds (see useApiQuery's NON_RETRYABLE
  // set), so these deliberately wait through 2 real automatic retries with
  // exponential backoff before the error settles -- that's the actual
  // production behavior, not something worth mocking away.
  it(
    "does not block the rest of Home when one section fails (commissions down, wallet still loads)",
    async () => {
      mockedFetchMyCommissions.mockRejectedValue(new ApiError("server", "Something broke.", 500));
      mockedFetchMyWallet.mockResolvedValue([
        { currency: "USD", status: "active", pending_balance: "0.00", available_balance: "50.00" },
      ] satisfies WalletSummary[]);
      const { findByText } = await renderHome();
      expect(await findByText(/Something went wrong/, undefined, { timeout: 8000 })).toBeTruthy();
      expect(await findByText("USD")).toBeTruthy();
      expect(await findByText(/50\.00/)).toBeTruthy();
    },
    15000,
  );

  it(
    "shows an offline message with a working retry",
    async () => {
      mockedFetchMyCommissions.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
      const { findByText, getByText } = await renderHome();
      expect(await findByText(/offline/i, undefined, { timeout: 8000 })).toBeTruthy();

      mockedFetchMyCommissions.mockResolvedValueOnce([]);
      fireEvent.press(getByText("Try again"));
      expect(await findByText("No commissions yet")).toBeTruthy();
    },
    15000,
  );
});

describe("Home: loading", () => {
  it("shows a skeleton before data resolves, then the real content", async () => {
    let resolveAffiliate!: (value: AffiliateProfile) => void;
    mockedFetchMyAffiliateProfile.mockReturnValue(
      new Promise<AffiliateProfile>((resolve) => {
        resolveAffiliate = resolve;
      }),
    );

    const { queryByText, findByText } = await renderHome();
    expect(queryByText("AFF100")).toBeNull();

    await act(async () => {
      resolveAffiliate(ACTIVE_AFFILIATE);
    });
    expect(await findByText("AFF100")).toBeTruthy();
  });
});

describe("Home: pull-to-refresh", () => {
  it("refetches tenant queries on pull-to-refresh", async () => {
    const { findByText, getByTestId } = await renderHome();
    await findByText("AFF100");
    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(1);

    const scrollView = getByTestId("home-scroll");
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(2);
    expect(mockedFetchMyWallet).toHaveBeenCalledTimes(2);
  });
});
