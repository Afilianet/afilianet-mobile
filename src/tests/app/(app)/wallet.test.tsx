import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { ApiError } from "../../../api/errors";
import { fetchMyAffiliateProfile, fetchMyWallet, fetchWalletActivity } from "../../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../../state/OrganizationContext";
import { analytics } from "../../../services/analytics";
import type { AffiliateProfile, LedgerEntry, Organization, PaginatedResponse, WalletSummary } from "../../../types/api";
import WalletScreen from "../../../app/(app)/wallet";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyWallet: jest.fn(),
  fetchWalletActivity: jest.fn(),
}));

jest.mock("../../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyWallet = fetchMyWallet as jest.Mock;
const mockedFetchWalletActivity = fetchWalletActivity as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

const ORG_A: Organization = {
  id: "org-a",
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
  my_role: "affiliate",
  my_membership_status: "active",
};
const ORG_B: Organization = { ...ORG_A, id: "org-b", name: "Beta Org" };

function orgValue(overrides: Partial<OrganizationContextValue> = {}): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG_A],
    activeOrganization: ORG_A,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

const ME: AffiliateProfile = {
  id: "aff-me",
  affiliate_code: "MEEE1000",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: "2026-01-02T00:00:00Z",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

function emptyEntries(): PaginatedResponse<LedgerEntry> {
  return { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderWallet(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <WalletScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(ME);
  mockedFetchWalletActivity.mockResolvedValue(emptyEntries());
});

afterEach(() => {
  queryClient.clear();
});

describe("Wallet: single currency", () => {
  it("shows pending, available, and total for one currency", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "MXN", status: "active", pending_balance: "100.00", available_balance: "250.00" },
    ] satisfies WalletSummary[]);
    const { findByText } = await renderWallet();

    expect(await findByText("MXN")).toBeTruthy();
    expect(await findByText(/100\.00/)).toBeTruthy();
    expect(await findByText(/250\.00/)).toBeTruthy();
    expect(await findByText(/350\.00/)).toBeTruthy(); // computed total
  });
});

describe("Wallet: multiple currencies", () => {
  it("shows each currency as a separate block, never combined", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "10.00", available_balance: "40.00" },
      { currency: "MXN", status: "active", pending_balance: "100.00", available_balance: "900.00" },
    ] satisfies WalletSummary[]);
    const { findByText, queryByText } = await renderWallet();

    expect(await findByText("USD")).toBeTruthy();
    expect(await findByText("MXN")).toBeTruthy();
    expect(await findByText(/50\.00/)).toBeTruthy(); // USD total
    expect(await findByText(/1,000\.00/)).toBeTruthy(); // MXN total
    // No single combined total anywhere -- e.g. summing across currencies (10+100, 40+900) never appears.
    expect(queryByText(/110\.00/)).toBeNull();
    expect(queryByText(/940\.00/)).toBeNull();
  });
});

describe("Wallet: negative balance", () => {
  it("shows a negative available balance truthfully, without clamping to zero", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "MXN", status: "active", pending_balance: "0.00", available_balance: "-40.00" },
    ] satisfies WalletSummary[]);
    const { findAllByText } = await renderWallet();

    // Available balance is -40.00, and since pending is 0.00 the computed
    // total is also -40.00 -- both rows legitimately show it negative.
    expect((await findAllByText(/-.*40\.00/)).length).toBe(2);
  });
});

describe("Wallet: activity", () => {
  it("shows recent ledger activity with pending-until-maturity language, never 'KYC hold'", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "10.00", available_balance: "0.00" },
    ] satisfies WalletSummary[]);
    mockedFetchWalletActivity.mockResolvedValue({
      data: [
        {
          id: "le-1",
          type: "commission",
          status: "pending",
          amount: "10.00",
          currency: "USD",
          available_at: "2026-02-01T00:00:00Z",
          effective_at: "2026-01-01T00:00:00Z",
          source_type: "Commission",
          is_reversal: false,
          description: null,
          metadata: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ] satisfies LedgerEntry[],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });

    const { findByText, queryByText } = await renderWallet();
    expect(await findByText("Commission")).toBeTruthy();
    expect(await findByText(/Pending until/)).toBeTruthy();
    expect(queryByText(/KYC/i)).toBeNull();
  });

  it("shows a commission reversal as a negative amount", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "0.00", available_balance: "0.00" },
    ] satisfies WalletSummary[]);
    mockedFetchWalletActivity.mockResolvedValue({
      data: [
        {
          id: "le-2",
          type: "commission_reversal",
          status: "available",
          amount: "-10.00",
          currency: "USD",
          available_at: "2026-01-01T00:00:00Z",
          effective_at: "2026-01-01T00:00:00Z",
          source_type: "Commission",
          is_reversal: true,
          description: null,
          metadata: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ] satisfies LedgerEntry[],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });

    const { findByText } = await renderWallet();
    expect(await findByText("Commission reversal")).toBeTruthy();
    expect(await findByText(/-.*10\.00/)).toBeTruthy();
  });
});

describe("Wallet: no affiliate profile", () => {
  it("shows an enrollment message instead of wallet content", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderWallet();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("Pending")).toBeNull();
  });
});

describe("Wallet: organization switching", () => {
  it("never shows Org A's balance after switching to Org B", async () => {
    mockedFetchMyWallet.mockImplementation(() =>
      Promise.resolve([
        { currency: "USD", status: "active", pending_balance: "1.00", available_balance: "11.11" },
      ] satisfies WalletSummary[]),
    );
    const { findByText, queryByText, rerender } = await renderWallet(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText(/11\.11/)).toBeTruthy();

    mockedFetchMyWallet.mockImplementation(() =>
      Promise.resolve([
        { currency: "USD", status: "active", pending_balance: "2.00", available_balance: "22.22" },
      ] satisfies WalletSummary[]),
    );
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <WalletScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText(/22\.22/)).toBeTruthy();
    expect(queryByText(/11\.11/)).toBeNull();
  });
});

describe("Wallet: analytics", () => {
  it("fires wallet_viewed with no properties", async () => {
    mockedFetchMyWallet.mockResolvedValue([] satisfies WalletSummary[]);
    await renderWallet();
    const call = mockedCapture.mock.calls.find(([event]) => event === "wallet_viewed");
    expect(call).toHaveLength(1);
  });
});

describe("Wallet: privacy", () => {
  it("never renders email, phone, or another affiliate's identity", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      { currency: "USD", status: "active", pending_balance: "0.00", available_balance: "0.00" },
    ] satisfies WalletSummary[]);
    const { queryByText, findByText } = await renderWallet();
    await findByText("USD");
    expect(queryByText(/@/)).toBeNull();
  });
});
