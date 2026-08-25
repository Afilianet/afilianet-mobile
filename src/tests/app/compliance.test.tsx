import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchComplianceSteps, fetchMyAffiliateProfile, fetchMyCompliance, startCompliance } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile, ComplianceCase, ComplianceStep, Organization } from "../../types/api";
import ComplianceScreen from "../../app/compliance";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
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

const AFFILIATE: AffiliateProfile = {
  id: "aff-1",
  affiliate_code: "AFF100",
  status: "pending",
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: null,
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

function complianceCase(overrides: Partial<ComplianceCase> = {}): ComplianceCase {
  return {
    id: "case-1",
    status: "in_progress",
    current_step: "identity_document",
    risk_level: null,
    started_at: "2026-01-01T00:00:00Z",
    submitted_at: null,
    reviewed_at: null,
    approved_at: null,
    rejected_at: null,
    expires_at: null,
    rejection_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function step(overrides: Partial<ComplianceStep> = {}): ComplianceStep {
  return {
    id: "step-1",
    step_type: "identity_document",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderCompliance(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <ComplianceScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue([step()]);
});

afterEach(() => {
  queryClient.clear();
});

describe("Compliance: case statuses", () => {
  it("shows not_started with a Start verification CTA when no case exists yet", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    const { findByText } = await renderCompliance();
    expect(await findByText("Not started")).toBeTruthy();
    expect(await findByText("Start verification")).toBeTruthy();
  });

  it("shows in_progress", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();
    expect(await findByText("In progress")).toBeTruthy();
  });

  it("shows pending_review", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "pending_review", current_step: null }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Pending review")).toBeTruthy();
  });

  it("shows manual_review", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "manual_review", current_step: null }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Manual review")).toBeTruthy();
  });

  it("shows approved with the approval date and no next-step line", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "approved", current_step: null, approved_at: "2026-01-05T00:00:00Z" }),
    );
    const { findAllByText, queryByText } = await renderCompliance();
    // Appears twice by design: the status badge, and the "Approved <date>" line below it.
    expect((await findAllByText(/Approved/)).length).toBe(2);
    expect(queryByText(/^Next:/)).toBeNull();
  });

  it("shows rejected with the rejection reason", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "rejected", current_step: null, rejection_reason: "Document was blurry" }),
    );
    const { findByText } = await renderCompliance();
    expect(await findByText("Rejected")).toBeTruthy();
    expect(await findByText("Document was blurry")).toBeTruthy();
  });

  it("shows expired with the expiration date", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "expired", current_step: null, expires_at: "2026-01-10T00:00:00Z" }),
    );
    const { findAllByText } = await renderCompliance();
    // Appears twice by design: the status badge, and the "Expired <date>" line below it.
    expect((await findAllByText(/Expired/)).length).toBe(2);
  });

  it("shows the next required step for a non-terminal case", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress", current_step: "terms_acceptance" }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Next: Terms acceptance")).toBeTruthy();
  });
});

describe("Compliance: required steps", () => {
  it("renders only the steps the organization actually configured -- not all six types", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "s1", step_type: "identity_document" }),
      step({ id: "s2", step_type: "terms_acceptance" }),
    ]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Identity document")).toBeTruthy();
    expect(await findByText("Terms acceptance")).toBeTruthy();
    expect(queryByText("Liveness check")).toBeNull();
    expect(queryByText("Face match")).toBeNull();
    expect(queryByText("Verbal consent")).toBeNull();
    expect(queryByText("Identity information")).toBeNull();
  });

  it("renders a single-step org configuration just as accurately as a multi-step one", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "s1", step_type: "identity_document" })]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Identity document")).toBeTruthy();
    expect(queryByText("Terms acceptance")).toBeNull();
  });

  it("shows a pending step as not-yet-actionable rather than a fake working CTA", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "pending" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText(/isn't available in this app version yet/i)).toBeTruthy();
  });

  it("shows a passed step as completed, with its completion date", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "passed", completed_at: "2026-01-03T00:00:00Z" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Passed")).toBeTruthy();
    expect(await findByText(/verified/i)).toBeTruthy();
    expect(await findByText(/Completed/)).toBeTruthy();
  });

  it("shows a failed step's retry-needed state without offering a non-functional retry action", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "failed", attempt_count: 1 })]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Failed")).toBeTruthy();
    expect(await findByText(/couldn't be verified/i)).toBeTruthy();
    expect(queryByText("Retry")).toBeNull();
  });

  it("never renders raw provider or score values", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ status: "passed", provider: "fake-identity", score: 0.95, completed_at: "2026-01-03T00:00:00Z" }),
    ]);
    const { queryByText } = await renderCompliance();
    await waitFor(() => expect(mockedFetchComplianceSteps).toHaveBeenCalled());
    expect(queryByText(/fake-identity/i)).toBeNull();
    expect(queryByText(/0\.95/)).toBeNull();
  });

  it("does not crash the whole screen when only the steps request fails", async () => {
    // A non-retryable kind so the query settles into isError immediately,
    // instead of the test having to wait through real retry backoff delays.
    mockedFetchComplianceSteps.mockRejectedValue(new ApiError("forbidden", "Forbidden.", 403));
    const { findByText } = await renderCompliance();
    expect(await findByText("In progress")).toBeTruthy(); // case card still rendered
    expect(await findByText(/Couldn't load your required steps/i)).toBeTruthy();
  });
});

describe("Compliance: starting a case", () => {
  it("starts a case and shows the resulting state", async () => {
    mockedFetchMyCompliance.mockRejectedValueOnce(NOT_FOUND);
    mockedStartCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    const startButton = await findByText("Start verification");
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    await act(async () => {
      fireEvent.press(startButton);
    });

    expect(mockedStartCompliance).toHaveBeenCalledTimes(1);
    expect(await findByText("In progress")).toBeTruthy();
  });

  it("shows a clear error and lets the affiliate try again if starting fails", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    mockedStartCompliance.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderCompliance();

    const startButton = await findByText("Start verification");
    await act(async () => {
      fireEvent.press(startButton);
    });

    expect(await findByText(/couldn't start verification/i)).toBeTruthy();
  });
});

describe("Compliance: errors and empty states", () => {
  it("shows an enrollment message instead of compliance content with no affiliate profile", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("In progress")).toBeNull();
  });

  it("shows a retryable error state on a 403", async () => {
    mockedFetchMyCompliance.mockRejectedValue(new ApiError("forbidden", "Forbidden.", 403));
    const { findByText } = await renderCompliance();
    expect(await findByText(/don't have permission/i)).toBeTruthy();
  });
});

describe("Compliance: pull-to-refresh", () => {
  it("refetches affiliate profile, case, and steps together -- how an approval becomes visible", async () => {
    const { findByText, getByTestId } = await renderCompliance();
    await findByText("In progress");
    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(1);
    expect(mockedFetchMyCompliance).toHaveBeenCalledTimes(1);
    expect(mockedFetchComplianceSteps).toHaveBeenCalledTimes(1);

    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "approved", current_step: null }));
    mockedFetchMyAffiliateProfile.mockResolvedValue({ ...AFFILIATE, status: "active", activated_at: "2026-01-06T00:00:00Z" });

    const scrollView = getByTestId("compliance-scroll");
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(2);
    expect(mockedFetchMyCompliance).toHaveBeenCalledTimes(2);
    expect(mockedFetchComplianceSteps).toHaveBeenCalledTimes(2);
    expect(await findByText("Approved")).toBeTruthy();
  });
});

describe("Compliance: organization switching", () => {
  it("never shows Org A's compliance data after switching to Org B", async () => {
    mockedFetchMyCompliance.mockImplementation(() =>
      Promise.resolve(complianceCase({ status: "in_progress", rejection_reason: null })),
    );
    const { findByText, queryByText, rerender } = await renderCompliance(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText("In progress")).toBeTruthy();

    mockedFetchMyCompliance.mockImplementation(() => Promise.resolve(complianceCase({ status: "approved", current_step: null })));
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("Approved")).toBeTruthy();
    expect(queryByText("In progress")).toBeNull();
  });
});

describe("Compliance: analytics", () => {
  it("fires compliance_viewed with no properties", async () => {
    await renderCompliance();
    const call = mockedCapture.mock.calls.find(([event]) => event === "compliance_viewed");
    expect(call).toHaveLength(1);
  });
});
