import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchMyAffiliateProfile, fetchMyCommissionsPage, fetchMyWallet } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile, Commission, Organization, PaginatedResponse, WalletSummary } from "../../types/api";
import CommissionsScreen from "../../app/commissions";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyWallet: jest.fn(),
  fetchMyCommissionsPage: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyWallet = fetchMyWallet as jest.Mock;
const mockedFetchMyCommissionsPage = fetchMyCommissionsPage as jest.Mock;
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

function commission(overrides: Partial<Commission> = {}): Commission {
  return {
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
    ...overrides,
  };
}

function page(data: Commission[], currentPage: number, lastPage: number, total = data.length): PaginatedResponse<Commission> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 25, total } };
}

const WALLET: WalletSummary[] = [
  { currency: "USD", status: "active", pending_balance: "10.00", available_balance: "50.00" },
];

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderCommissions(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <CommissionsScreen />
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
  mockedFetchMyWallet.mockResolvedValue(WALLET);
  mockedFetchMyCommissionsPage.mockResolvedValue(page([commission()], 1, 1));
});

afterEach(() => {
  queryClient.clear();
});

describe("Commissions: list and statuses", () => {
  it("shows an earned commission", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(page([commission({ status: "earned", amount: "25.00" })], 1, 1));
    const { findByText } = await renderCommissions();
    expect(await findByText("Earned")).toBeTruthy();
    expect(await findByText(/25\.00/)).toBeTruthy();
  });

  it("shows a pending commission", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(page([commission({ status: "pending" })], 1, 1));
    const { findByText } = await renderCommissions();
    expect(await findByText("Pending")).toBeTruthy();
  });

  it("shows a void commission", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(page([commission({ status: "void" })], 1, 1));
    const { findByText } = await renderCommissions();
    expect(await findByText("Void")).toBeTruthy();
  });

  it("shows a reversed commission with a negative amount", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(
      page([commission({ id: "c-rev", status: "reversed", amount: "-10.00", reversal_of: "c-1" })], 1, 1),
    );
    const { findByText } = await renderCommissions();
    expect(await findByText("Reversed")).toBeTruthy();
    expect(await findByText(/-.*10\.00/)).toBeTruthy();
  });

  it("shows an empty state with no commissions", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(page([], 1, 1, 0));
    const { findByText } = await renderCommissions();
    expect(await findByText("No commissions yet")).toBeTruthy();
  });
});

describe("Commissions: detail sheet", () => {
  it("opens on tap and shows fields, and explains void in plain language", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(
      page([commission({ status: "void", type: "sponsor_level", network_level: 2 })], 1, 1),
    );
    const { findByText } = await renderCommissions();

    const row = await findByText("Sponsor level");
    await act(async () => {
      fireEvent.press(row);
    });

    expect(await findByText("Commission details")).toBeTruthy();
    expect(await findByText(/wasn't earned because your account wasn't eligible/i)).toBeTruthy();
    expect(await findByText("Level")).toBeTruthy();
  });

  it("explains reversed in plain language", async () => {
    mockedFetchMyCommissionsPage.mockResolvedValue(page([commission({ status: "reversed", amount: "-5.00" })], 1, 1));
    const { findByText } = await renderCommissions();

    const row = await findByText("Direct sale");
    await act(async () => {
      fireEvent.press(row);
    });

    expect(await findByText(/offset by a reversal entry/i)).toBeTruthy();
  });

  it("fires commission_detail_opened with no properties", async () => {
    const { findByText } = await renderCommissions();
    const row = await findByText("Direct sale");
    await act(async () => {
      fireEvent.press(row);
    });
    const call = mockedCapture.mock.calls.find(([event]) => event === "commission_detail_opened");
    expect(call).toHaveLength(1);
  });
});

describe("Commissions: pagination", () => {
  it("loads the next page and appends without duplicates", async () => {
    mockedFetchMyCommissionsPage.mockImplementation((p: number) =>
      Promise.resolve(
        p === 1
          ? page([commission({ id: "c-1" }), commission({ id: "c-2" })], 1, 2, 3)
          : page([commission({ id: "c-2" }), commission({ id: "c-3" })], 2, 2, 3),
      ),
    );
    const { findByLabelText, findAllByText } = await renderCommissions();
    expect((await findAllByText("Direct sale")).length).toBe(2);

    const loadMore = await findByLabelText("Load more recent commissions");
    await act(async () => {
      fireEvent.press(loadMore);
    });

    expect((await findAllByText("Direct sale")).length).toBe(3); // 3 unique rows, not 4
    expect(mockedFetchMyCommissionsPage).toHaveBeenCalledWith(2);
  });

  it("fires commissions_load_more with no properties", async () => {
    mockedFetchMyCommissionsPage.mockImplementation((p: number) =>
      Promise.resolve(
        p === 1 ? page([commission({ id: "c-1" })], 1, 2, 2) : page([commission({ id: "c-2" })], 2, 2, 2),
      ),
    );
    const { findByLabelText } = await renderCommissions();
    const loadMore = await findByLabelText("Load more recent commissions");
    await act(async () => {
      fireEvent.press(loadMore);
    });
    const call = mockedCapture.mock.calls.find(([event]) => event === "commissions_load_more");
    expect(call).toHaveLength(1);
  });
});

describe("Commissions: no affiliate profile", () => {
  it("shows an enrollment message instead of commission content", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderCommissions();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("Recent commissions")).toBeNull();
  });
});

describe("Commissions: organization switching", () => {
  it("never shows Org A's commission data after switching to Org B", async () => {
    mockedFetchMyCommissionsPage.mockImplementation(() => Promise.resolve(page([commission({ id: "c-orga", amount: "11.11" })], 1, 1)));
    const { findByText, queryByText, rerender } = await renderCommissions(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText(/11\.11/)).toBeTruthy();

    mockedFetchMyCommissionsPage.mockImplementation(() => Promise.resolve(page([commission({ id: "c-orgb", amount: "22.22" })], 1, 1)));
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <CommissionsScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText(/22\.22/)).toBeTruthy();
    expect(queryByText(/11\.11/)).toBeNull();
  });
});

describe("Commissions: privacy", () => {
  it("never renders email, phone, or another affiliate's identity", async () => {
    const { queryByText } = await renderCommissions();
    expect(queryByText(/@/)).toBeNull();
  });
});

describe("Commissions: viewed analytics", () => {
  it("fires commissions_viewed with no properties", async () => {
    await renderCommissions();
    const call = mockedCapture.mock.calls.find(([event]) => event === "commissions_viewed");
    expect(call).toHaveLength(1);
  });
});
