import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../../api/errors";
import { fetchMyAffiliateProfile, fetchMyCompliance } from "../../../api/endpoints";
import { AuthContext, type AuthContextValue } from "../../../auth/AuthContext";
import { OrganizationContext, type OrganizationContextValue } from "../../../state/OrganizationContext";
import { analytics } from "../../../services/analytics";
import type { AffiliateProfile, ComplianceCase, Organization, User } from "../../../types/api";
import ProfileScreen from "../../../app/(app)/profile";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock("../../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
}));

jest.mock("../../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

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
  my_role: "affiliate",
  my_membership_status: "active",
};
const ORG_2: Organization = { ...ORG, id: "org-2", name: "Beta Org" };

const mockSignOut = jest.fn();
const mockSelectOrganization = jest.fn();

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "signedIn", user: USER, error: null, signIn: jest.fn(), signOut: mockSignOut, ...overrides };
}

function orgValue(overrides: Partial<OrganizationContextValue> = {}): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG],
    activeOrganization: ORG,
    error: null,
    selectOrganization: mockSelectOrganization,
    refresh: jest.fn(),
    ...overrides,
  };
}

const AFFILIATE: AffiliateProfile = {
  id: "aff-1",
  affiliate_code: "AFF100",
  status: "active",
  sponsor: { id: "aff-sponsor", affiliate_code: "SPON001" },
  placement_parent: { id: "aff-parent", affiliate_code: "PLAC001" },
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: "2026-01-02T00:00:00Z",
  metadata: { internal_note: "do-not-show-this" },
  created_at: "2026-01-01T00:00:00Z",
};

function complianceCase(overrides: Partial<ComplianceCase> = {}): ComplianceCase {
  return {
    id: "case-1",
    status: "approved",
    current_step: null,
    risk_level: null,
    started_at: "2026-01-01T00:00:00Z",
    submitted_at: null,
    reviewed_at: null,
    approved_at: "2026-01-03T00:00:00Z",
    rejected_at: null,
    expires_at: null,
    rejection_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderProfile(options: { auth?: Partial<AuthContextValue>; org?: Partial<OrganizationContextValue> } = {}) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue(options.auth)}>
          <OrganizationContext.Provider value={orgValue(options.org)}>
            <ProfileScreen />
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
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
});

afterEach(() => {
  queryClient.clear();
});

describe("Profile: real affiliate data", () => {
  it("shows the user's name/email and the affiliate's code, status, dates, sponsor, and placement parent", async () => {
    const { findByText } = await renderProfile();
    expect(await findByText("Jordan Lee")).toBeTruthy();
    expect(await findByText("jordan@example.com")).toBeTruthy();
    expect(await findByText("AFF100")).toBeTruthy();
    expect(await findByText("Active")).toBeTruthy();
    expect(await findByText("SPON001")).toBeTruthy();
    expect(await findByText("PLAC001")).toBeTruthy();
  });

  it("shows the active organization's name", async () => {
    const { findByText } = await renderProfile();
    expect(await findByText("Acme")).toBeTruthy();
  });

  it("never renders raw affiliate metadata", async () => {
    const { queryByText, findByText } = await renderProfile();
    await findByText("AFF100");
    expect(queryByText(/do-not-show-this/i)).toBeNull();
  });
});

describe("Profile: loading and error states", () => {
  it("shows a skeleton before affiliate data resolves", async () => {
    let resolveAffiliate!: (value: AffiliateProfile) => void;
    mockedFetchMyAffiliateProfile.mockReturnValue(
      new Promise<AffiliateProfile>((resolve) => {
        resolveAffiliate = resolve;
      }),
    );
    const { queryByText, findByText } = await renderProfile();
    expect(queryByText("AFF100")).toBeNull();
    await act(async () => {
      resolveAffiliate(AFFILIATE);
    });
    expect(await findByText("AFF100")).toBeTruthy();
  });

  it("shows an enrollment message with no affiliate profile", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderProfile();
    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("AFF100")).toBeNull();
  });

  it("shows a retryable error state on a non-recoverable failure", async () => {
    // Non-retryable kind so the query settles into isError immediately,
    // instead of the test having to wait through real retry backoff delays.
    // "unauthorized" (not "forbidden") so this hits SectionCard's plain
    // ErrorState branch rather than the dedicated ForbiddenState one.
    mockedFetchMyAffiliateProfile.mockRejectedValue(new ApiError("unauthorized", "Unauthorized.", 401));
    const { findByText } = await renderProfile();
    expect(await findByText(/session has expired/i)).toBeTruthy();
  });
});

describe("Profile: compliance summary", () => {
  it("shows the current compliance status and links to the full screen", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress", approved_at: null }));
    const { findByText } = await renderProfile();
    expect(await findByText("In progress")).toBeTruthy();

    await act(async () => {
      fireEvent.press(await findByText("View compliance"));
    });
    expect(mockPush).toHaveBeenCalledWith("/compliance");
  });

  it("shows not_started when no case exists yet", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    const { findByText } = await renderProfile();
    expect(await findByText("Not started")).toBeTruthy();
  });
});

describe("Profile: organizations and sign out", () => {
  it("lists organizations and switches on tap", async () => {
    const { findByText } = await renderProfile({ org: { organizations: [ORG, ORG_2] } });
    await act(async () => {
      fireEvent.press(await findByText("Beta Org"));
    });
    expect(mockSelectOrganization).toHaveBeenCalledWith("org-2");
  });

  it("hides the organizations card with only one organization", async () => {
    const { queryByText, findByText } = await renderProfile();
    await findByText("AFF100");
    expect(queryByText("Organizations")).toBeNull();
  });

  it("signs out on press", async () => {
    const { findByText } = await renderProfile();
    await act(async () => {
      fireEvent.press(await findByText("Sign out"));
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("Profile: analytics", () => {
  it("fires profile_viewed with no properties", async () => {
    await renderProfile();
    const call = mockedCapture.mock.calls.find(([event]) => event === "profile_viewed");
    expect(call).toHaveLength(1);
  });
});
