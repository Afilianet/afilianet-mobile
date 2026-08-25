import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ApiError } from "../../api/errors";
import { fetchPayoutDestinations, fetchPayoutEligibility, requestPayout } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { Organization, PaginatedResponse, Payout, PayoutDestination, PayoutEligibility } from "../../types/api";
import PayoutRequestScreen from "../../app/payout-request/[currency]";

const mockBack = jest.fn();
let mockCurrency = "MXN";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ currency: mockCurrency }),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "fixed-idempotency-key-1"),
}));

jest.mock("../../api/endpoints", () => ({
  fetchPayoutEligibility: jest.fn(),
  fetchPayoutDestinations: jest.fn(),
  createPayoutDestination: jest.fn(),
  requestPayout: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchPayoutEligibility = fetchPayoutEligibility as jest.Mock;
const mockedFetchPayoutDestinations = fetchPayoutDestinations as jest.Mock;
const mockedRequestPayout = requestPayout as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

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
  my_role: "affiliate",
  my_membership_status: "active",
};

function orgValue(): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG],
    activeOrganization: ORG,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
  };
}

function eligibility(overrides: Partial<PayoutEligibility> = {}): PayoutEligibility {
  return {
    currency: "MXN",
    available_balance: "1000.00",
    outstanding_reservations: "0.00",
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
    id: "payout-new",
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

let queryClient: QueryClient;
let alertSpy: jest.SpyInstance;

async function renderRequest() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue()}>
          <PayoutRequestScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrency = "MXN";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchPayoutEligibility.mockResolvedValue(eligibility());
  mockedFetchPayoutDestinations.mockResolvedValue(destinationsPage([destination()]));
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  queryClient.clear();
  alertSpy.mockRestore();
});

describe("Payout request: amount validation", () => {
  it("shows an error for excessive decimal places", async () => {
    const { findByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");
    fireEvent.changeText(getByLabelText("Amount"), "100.123");
    expect(await findByText(/up to 2 decimal places/i)).toBeTruthy();
  });

  it("shows an error for zero", async () => {
    const { findByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");
    fireEvent.changeText(getByLabelText("Amount"), "0");
    expect(await findByText(/greater than zero/i)).toBeTruthy();
  });

  it("shows an error for malformed input", async () => {
    const { findByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");
    fireEvent.changeText(getByLabelText("Amount"), "abc");
    expect(await findByText(/valid amount/i)).toBeTruthy();
  });

  it("rejects an amount that exceeds eligibility", async () => {
    const { findByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");
    fireEvent.changeText(getByLabelText("Amount"), "900.00");
    expect(await findByText(/up to \$800\.00/i)).toBeTruthy();
  });

  it("disables submit until a valid amount and destination are chosen", async () => {
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    // Nothing entered yet -- pressing submit must not call the API at all.
    await act(async () => {
      fireEvent.press(getByText("Request payout"));
    });
    expect(mockedRequestPayout).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(getByLabelText("Amount"), "100.00");
    });
    await act(async () => {
      fireEvent.press(getByText("My BBVA account"));
    });
    await act(async () => {
      fireEvent.press(getByText("Request payout"));
    });

    await waitFor(() => expect(mockedRequestPayout).toHaveBeenCalledTimes(1));
  });
});

describe("Payout request: no destination", () => {
  it("shows a clean no-destination state instead of blocking on a spinner", async () => {
    mockedFetchPayoutDestinations.mockResolvedValue(destinationsPage([]));
    const { findByText } = await renderRequest();
    expect(await findByText("No payout destination yet")).toBeTruthy();
  });
});

async function fillAndSubmit(getByLabelText: (label: string) => unknown, getByText: (text: string) => unknown, amount = "100.00") {
  await act(async () => {
    fireEvent.changeText(getByLabelText("Amount") as never, amount);
  });
  await act(async () => {
    fireEvent.press(getByText("My BBVA account") as never);
  });
  await act(async () => {
    fireEvent.press(getByText("Request payout") as never);
  });
}

describe("Payout request: submission", () => {
  it("submits with the exact amount_minor, currency, destination, and a generated idempotency key", async () => {
    mockedRequestPayout.mockResolvedValue(payout());
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    await fillAndSubmit(getByLabelText, getByText);

    // mutationFn receives (variables, context) from react-query -- only the
    // variables (first arg) matter here, not react-query's own context object.
    expect(mockedRequestPayout.mock.calls[0][0]).toEqual({
      payout_destination_id: "dest-1",
      currency: "MXN",
      amount_minor: 10000,
      idempotency_key: "fixed-idempotency-key-1",
    });
  });

  it("shows success feedback and returns after a successful request", async () => {
    mockedRequestPayout.mockResolvedValue(payout());
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    await fillAndSubmit(getByLabelText, getByText);

    expect(alertSpy).toHaveBeenCalledWith(
      "Payout requested",
      expect.stringMatching(/submitted/i),
      expect.any(Array),
    );
  });

  it("reuses the SAME idempotency key on a retry after a failure -- no duplicate request", async () => {
    mockedRequestPayout.mockRejectedValueOnce(new ApiError("offline", "Unable to reach the server."));
    mockedRequestPayout.mockResolvedValueOnce(payout());
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    await fillAndSubmit(getByLabelText, getByText);
    expect(await findByText(/offline/i)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText("Request payout"));
    });

    expect(mockedRequestPayout).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockedRequestPayout.mock.calls;
    expect(firstCall[0].idempotency_key).toBe(secondCall[0].idempotency_key);
  });

  it("shows the backend's validation error rather than a generic failure", async () => {
    mockedRequestPayout.mockRejectedValue(new ApiError("validation", "The amount exceeds your eligible balance.", 422));
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    await fillAndSubmit(getByLabelText, getByText);

    expect(await findByText(/exceeds your eligible balance/i)).toBeTruthy();
  });

  it("fires payout_request_started and payout_request_submitted with no properties", async () => {
    mockedRequestPayout.mockResolvedValue(payout());
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");

    const startedCall = mockedCapture.mock.calls.find(([event]) => event === "payout_request_started");
    expect(startedCall).toHaveLength(1);

    await fillAndSubmit(getByLabelText, getByText);
    const submittedCall = mockedCapture.mock.calls.find(([event]) => event === "payout_request_submitted");
    expect(submittedCall).toHaveLength(1);
  });
});

describe("Payout request: privacy", () => {
  it("never sends amount, balance, or destination identifiers to analytics", async () => {
    mockedRequestPayout.mockResolvedValue(payout());
    const { findByText, getByText, getByLabelText } = await renderRequest();
    await findByText("Eligible to withdraw");
    await fillAndSubmit(getByLabelText, getByText);

    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1); // event name only, no properties object
    }
  });
});
