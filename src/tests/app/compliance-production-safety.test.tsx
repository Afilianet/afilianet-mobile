import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { fetchComplianceSteps, fetchMyAffiliateProfile, fetchMyCompliance } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, ComplianceCase, ComplianceStep, Organization } from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * Confirms the "development mode" default used throughout compliance.test.tsx
 * (Jest sets __DEV__ true, and EXPO_PUBLIC_APP_ENV is unset -> "development")
 * is not the only thing keeping Fake-provider controls out of a real build --
 * this file forces isDevelopmentSimulatorEnabled false, the way a genuine
 * production build resolves it, and proves the simulator renders nothing at
 * all rather than merely being hidden.
 */
jest.mock("../../config/env", () => ({
  config: { appEnv: "production", apiBaseUrl: "", apiTimeoutMs: 15000, sentryDsn: "", posthogApiKey: "", posthogHost: "" },
  isDevelopmentSimulatorEnabled: false,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(),
  attemptComplianceStep: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;

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

let queryClient: QueryClient;

async function renderCompliance() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue()}>
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
});

afterEach(() => {
  queryClient.clear();
});

describe("Compliance in a production build", () => {
  it("shows no development simulator for any Fake-provider step type", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "s1", step_type: "identity_document" }),
      step({ id: "s2", step_type: "biometric_liveness" }),
      step({ id: "s3", step_type: "face_match" }),
      step({ id: "s4", step_type: "verbal_consent" }),
    ]);
    const { findByText, queryByText } = await renderCompliance();

    // Production-safe status copy for each step type still renders...
    expect(await findByText("Identity document")).toBeTruthy();
    expect(await findByText("Liveness check")).toBeTruthy();
    expect(await findByText("Face match")).toBeTruthy();
    expect(await findByText("Verbal consent")).toBeTruthy();

    // ...but no simulator, no Pass/Fail controls, anywhere on the screen.
    expect(queryByText("Development simulator")).toBeNull();
    expect(queryByText(/not available in production/i)).toBeNull();
    expect(queryByText("Pass")).toBeNull();
    expect(queryByText("Fail")).toBeNull();
  });

  it("still allows the real terms acceptance action -- it is not a Fake-provider step", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Accept terms")).toBeTruthy();
  });
});
