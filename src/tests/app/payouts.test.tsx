import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ApiError } from "../../api/errors";
import {
  cancelPayout,
  fetchMyAffiliateProfile,
  fetchMyPayouts,
  fetchPayoutDestinations,
  fetchPayoutEligibility,
  fetchMyWallet,
} from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type {
  AffiliateProfile,
  Organization,
  PaginatedResponse,
  Payout,
  PayoutDestination,
  PayoutEligibility,
  WalletSummary,
} from "../../types/api";
import PayoutsScreen from "../../app/payouts";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyWallet: jest.fn(),
  fetchPayoutDestinations: jest.fn(),
  fetchPayoutEligibility: jest.fn(),
  fetchMyPayouts: jest.fn(),
  cancelPayout: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyWallet = fetchMyWallet as jest.Mock;
const mockedFetchPayoutDestinations = fetchPayoutDestinations as jest.Mock;
const mockedFetchPayoutEligibility = fetchPayoutEligibility as jest.Mock;
const mockedFetchMyPayouts = fetchMyPayouts as jest.Mock;
const mockedCancelPayout = cancelPayout as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

/** Auto-confirms the "Cancel withdrawal?" Alert by invoking its destructive button. */
function autoConfirmCancelAlert() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    const destructive = buttons?.find((button) => button.style === "destructive");
    destructive?.onPress?.();
  });
}

async function openRequestedPayoutDetail(findByText: (text: RegExp | string) => Promise<unknown>) {
  const row = await findByText(/100\.00/);
  await act(async () => {
    fireEvent.press(row as never);
  });
}

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

function eligibility(overrides: Partial<PayoutEligibility> = {}): PayoutEligibility {
  return {
    currency: "MXN",
    available_balance: "1000.00",
    outstanding_reservations: "200.00",
    reserve: "0.00",
    eligible_balance: "800.00",
    minimum_payout: "50.00",
    ...overrides,
  };
}

function destination(overrides: Partial<PayoutDestination> = {}): PayoutDestination {
  return {
    id: "dest-1",
    type: "bank_account",
    currency: "MXN",
    country: "MX",
    provider: null,
    display_label: "My BBVA account",
    status: "active",
    verified_at: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function destinationsPage(data: PayoutDestination[]): PaginatedResponse<PayoutDestination> {
  return { data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } };
}

function payout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: "payout-1",
    destination: { id: "dest-1", display_label: "My BBVA account" },
    currency: "MXN",
    amount: "100.00",
    status: "requested",
    requested_at: "2026-01-01T00:00:00Z",
    processing_at: null,
    paid_at: null,
    failed_at: null,
    cancelled_at: null,
    failure_code: null,
    failure_reason: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function payoutsPage(data: Payout[], currentPage = 1, lastPage = 1, total = data.length): PaginatedResponse<Payout> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 20, total } };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);
const WALLET_MXN: WalletSummary = { currency: "MXN", status: "active", pending_balance: "0.00", available_balance: "1000.00" };

let queryClient: QueryClient;

async function renderPayouts(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <PayoutsScreen />
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
  mockedFetchMyWallet.mockResolvedValue([WALLET_MXN]);
  mockedFetchPayoutDestinations.mockResolvedValue(destinationsPage([destination()]));
  mockedFetchPayoutEligibility.mockResolvedValue(eligibility());
  mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout()]));
});

afterEach(() => {
  queryClient.clear();
});

describe("Payouts: eligibility by currency", () => {
  it("shows available, reserved, and eligible amounts distinctly", async () => {
    const { findByText } = await renderPayouts();
    expect(await findByText("MXN")).toBeTruthy();
    expect(await findByText(/1,000\.00/)).toBeTruthy(); // available wallet
    expect(await findByText(/200\.00/)).toBeTruthy(); // reserved
    expect(await findByText(/800\.00/)).toBeTruthy(); // eligible
  });

  it("never aggregates two currencies into one figure", async () => {
    mockedFetchMyWallet.mockResolvedValue([
      WALLET_MXN,
      { currency: "USD", status: "active", pending_balance: "0.00", available_balance: "555.00" },
    ] satisfies WalletSummary[]);
    mockedFetchPayoutEligibility.mockImplementation((currency: string) =>
      Promise.resolve(
        currency === "MXN"
          ? eligibility()
          : eligibility({
              currency: "USD",
              available_balance: "555.00",
              outstanding_reservations: "55.00",
              eligible_balance: "500.00",
            }),
      ),
    );
    const { findByText, queryByText } = await renderPayouts();

    expect(await findByText("MXN")).toBeTruthy();
    expect(await findByText("USD")).toBeTruthy();
    expect(await findByText(/800\.00/)).toBeTruthy(); // MXN eligible
    expect(await findByText(/500\.00/)).toBeTruthy(); // USD eligible
    // No combined 1300.00 figure anywhere.
    expect(queryByText(/1,300\.00/)).toBeNull();
  });
});

describe("Payouts: history and statuses", () => {
  it("shows all five payout statuses", async () => {
    mockedFetchMyPayouts.mockResolvedValue(
      payoutsPage([
        payout({ id: "p1", status: "requested" }),
        payout({ id: "p2", status: "processing" }),
        payout({ id: "p3", status: "paid" }),
        payout({ id: "p4", status: "failed" }),
        payout({ id: "p5", status: "cancelled" }),
      ]),
    );
    const { findByText } = await renderPayouts();
    expect(await findByText("Requested")).toBeTruthy();
    expect(await findByText("Processing")).toBeTruthy();
    expect(await findByText("Paid")).toBeTruthy();
    expect(await findByText("Failed")).toBeTruthy();
    expect(await findByText("Cancelled")).toBeTruthy();
  });

  it("shows an empty state with no payouts yet", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([]));
    const { findByText } = await renderPayouts();
    expect(await findByText("No payout requests yet")).toBeTruthy();
  });
});

describe("Payouts: detail sheet", () => {
  it("opens on tap and explains the status in plain language, with a cancel action for a requested payout", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    const { findByText } = await renderPayouts();

    await openRequestedPayoutDetail(findByText);

    expect(await findByText("Payout details")).toBeTruthy();
    expect(await findByText(/has been requested and that amount is reserved/i)).toBeTruthy();
    expect(await findByText("Cancel withdrawal")).toBeTruthy();
  });

  it("explains failed without implying a ledger refund", async () => {
    mockedFetchMyPayouts.mockResolvedValue(
      payoutsPage([payout({ status: "failed", failed_at: "2026-01-02T00:00:00Z" })]),
    );
    const { findByText, queryByText } = await renderPayouts();

    const row = await findByText(/100\.00/);
    await act(async () => {
      fireEvent.press(row);
    });

    expect(await findByText(/reservation was released/i)).toBeTruthy();
    expect(queryByText(/refund/i)).toBeNull();
  });

  it.each(["processing", "paid", "failed", "cancelled"] as const)(
    "hides the cancel action for a %s payout",
    async (status) => {
      mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status })]));
      const { findByText, queryByText } = await renderPayouts();

      const row = await findByText(/100\.00/);
      await act(async () => {
        fireEvent.press(row);
      });

      expect(await findByText("Payout details")).toBeTruthy();
      expect(queryByText("Cancel withdrawal")).toBeNull();
    },
  );
});

describe("Payouts: cancellation", () => {
  it("requires confirmation before cancelling -- dismissing the alert never calls the API", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { findByText } = await renderPayouts();

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Cancel withdrawal?",
      expect.stringMatching(/releases the reserved amount/i),
      expect.any(Array),
    );
    expect(mockedCancelPayout).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("cancels the payout, closes the sheet, and shows a non-blocking confirmation", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    mockedCancelPayout.mockResolvedValue(payout({ status: "cancelled", cancelled_at: "2026-01-03T00:00:00Z" }));
    const alertSpy = autoConfirmCancelAlert();
    const { findByText, queryByText } = await renderPayouts();

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });

    expect(mockedCancelPayout.mock.calls[0][0]).toBe("payout-1");
    await waitFor(() => expect(queryByText("Payout details")).toBeNull());
    expect(await findByText(/withdrawal cancelled/i)).toBeTruthy();

    alertSpy.mockRestore();
  });

  it("invalidates payout history, eligibility, and wallet queries after cancellation", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    mockedCancelPayout.mockResolvedValue(payout({ status: "cancelled", cancelled_at: "2026-01-03T00:00:00Z" }));
    const alertSpy = autoConfirmCancelAlert();
    const { findByText } = await renderPayouts();
    await findByText("MXN");

    const payoutsCallsBefore = mockedFetchMyPayouts.mock.calls.length;
    const eligibilityCallsBefore = mockedFetchPayoutEligibility.mock.calls.length;
    const walletCallsBefore = mockedFetchMyWallet.mock.calls.length;

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });
    await waitFor(() => expect(mockedFetchMyPayouts.mock.calls.length).toBeGreaterThan(payoutsCallsBefore));

    await waitFor(() => expect(mockedFetchPayoutEligibility.mock.calls.length).toBeGreaterThan(eligibilityCallsBefore));
    await waitFor(() => expect(mockedFetchMyWallet.mock.calls.length).toBeGreaterThan(walletCallsBefore));

    alertSpy.mockRestore();
  });

  it("refreshes payout data and shows a clear message when the payout already transitioned (422 race)", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    mockedCancelPayout.mockRejectedValue(
      new ApiError("validation", 'Cannot move a payout from "processing" to "cancelled".', 422),
    );
    const alertSpy = autoConfirmCancelAlert();
    const { findByText, queryByText } = await renderPayouts();

    const payoutsCallsBefore = mockedFetchMyPayouts.mock.calls.length;

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });

    await waitFor(() => expect(queryByText("Payout details")).toBeNull());
    expect(await findByText(/already moved on/i)).toBeTruthy();
    await waitFor(() => expect(mockedFetchMyPayouts.mock.calls.length).toBeGreaterThan(payoutsCallsBefore));

    alertSpy.mockRestore();
  });

  it("shows a permission error and keeps the sheet open on a 403", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    mockedCancelPayout.mockRejectedValue(new ApiError("forbidden", "This action is unauthorized.", 403));
    const alertSpy = autoConfirmCancelAlert();
    const { findByText } = await renderPayouts();

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });

    expect(await findByText(/don't have permission/i)).toBeTruthy();
    expect(await findByText("Payout details")).toBeTruthy();

    alertSpy.mockRestore();
  });

  it("fires payout_cancelled with no properties, only on success", async () => {
    mockedFetchMyPayouts.mockResolvedValue(payoutsPage([payout({ status: "requested" })]));
    mockedCancelPayout.mockResolvedValue(payout({ status: "cancelled", cancelled_at: "2026-01-03T00:00:00Z" }));
    const alertSpy = autoConfirmCancelAlert();
    const { findByText } = await renderPayouts();

    await openRequestedPayoutDetail(findByText);
    await act(async () => {
      fireEvent.press(await findByText("Cancel withdrawal"));
    });
    await waitFor(() => expect(mockedCancelPayout).toHaveBeenCalledTimes(1));

    const cancelledCall = mockedCapture.mock.calls.find(([event]) => event === "payout_cancelled");
    expect(cancelledCall).toHaveLength(1); // event name only, no properties argument at all

    alertSpy.mockRestore();
  });
});

describe("Payouts: destinations", () => {
  it("shows the destination's display label only -- no raw bank data", async () => {
    const { findAllByText, queryByText } = await renderPayouts();
    // Appears twice by design: once in the destinations list, once as the
    // referenced destination on the matching payout row below it.
    expect((await findAllByText("My BBVA account")).length).toBeGreaterThan(0);
    expect(queryByText(/provider_reference/i)).toBeNull();
    expect(queryByText(/clabe/i)).toBeNull();
  });

  it("shows a clean no-destination state", async () => {
    mockedFetchPayoutDestinations.mockResolvedValue(destinationsPage([]));
    const { findByText } = await renderPayouts();
    expect(await findByText(/No payout destination yet/)).toBeTruthy();
  });
});

describe("Payouts: no affiliate profile", () => {
  it("shows an enrollment message instead of payout content", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderPayouts();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("Recent payouts")).toBeNull();
  });
});

describe("Payouts: organization switching", () => {
  it("never shows Org A's payout data after switching to Org B", async () => {
    mockedFetchMyPayouts.mockImplementation(() => Promise.resolve(payoutsPage([payout({ id: "p-orga", amount: "11.11" })])));
    const { findByText, queryByText, rerender } = await renderPayouts(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText(/11\.11/)).toBeTruthy();

    mockedFetchMyPayouts.mockImplementation(() => Promise.resolve(payoutsPage([payout({ id: "p-orgb", amount: "22.22" })])));
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <PayoutsScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText(/22\.22/)).toBeTruthy();
    expect(queryByText(/11\.11/)).toBeNull();
  });
});

describe("Payouts: analytics", () => {
  it("fires payouts_viewed with no properties", async () => {
    await renderPayouts();
    const call = mockedCapture.mock.calls.find(([event]) => event === "payouts_viewed");
    expect(call).toHaveLength(1);
  });
});

describe("Payouts: privacy", () => {
  it("never renders email, phone, or raw bank identifiers", async () => {
    const { queryByText, findAllByText } = await renderPayouts();
    await findAllByText("My BBVA account");
    expect(queryByText(/@/)).toBeNull();
  });
});
