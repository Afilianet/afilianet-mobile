import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../../api/errors";
import {
  fetchMyAffiliateProfile,
  fetchMyInvitations,
  fetchMyPlacementChildren,
  fetchMyPlacementParent,
  fetchMySponsor,
  fetchMySponsored,
} from "../../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../../state/OrganizationContext";
import { analytics } from "../../../services/analytics";
import type { AffiliateProfile, Invitation, Organization, PaginatedResponse } from "../../../types/api";
import NetworkScreen from "../../../app/(app)/network";

const mockRouter = { push: jest.fn(), back: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMySponsor: jest.fn(),
  fetchMyPlacementParent: jest.fn(),
  fetchMySponsored: jest.fn(),
  fetchMyPlacementChildren: jest.fn(),
  fetchMyInvitations: jest.fn(),
}));

jest.mock("../../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMySponsor = fetchMySponsor as jest.Mock;
const mockedFetchMyPlacementParent = fetchMyPlacementParent as jest.Mock;
const mockedFetchMySponsored = fetchMySponsored as jest.Mock;
const mockedFetchMyPlacementChildren = fetchMyPlacementChildren as jest.Mock;
const mockedFetchMyInvitations = fetchMyInvitations as jest.Mock;
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

const SPONSOR: AffiliateProfile = {
  id: "aff-sponsor",
  affiliate_code: "SPON5000",
  status: "active",
  user: { id: "u-sponsor", first_name: "Sonia", last_name: "Sponsor" },
  joined_at: "2025-01-01T00:00:00Z",
  activated_at: "2025-01-02T00:00:00Z",
  metadata: null,
  created_at: "2025-01-01T00:00:00Z",
};

const PLACEMENT_PARENT: AffiliateProfile = {
  id: "aff-placement-parent",
  affiliate_code: "PLAC6000",
  status: "active",
  user: { id: "u-parent", first_name: "Paula", last_name: "Parent" },
  joined_at: "2025-02-01T00:00:00Z",
  activated_at: "2025-02-02T00:00:00Z",
  metadata: null,
  created_at: "2025-02-01T00:00:00Z",
};

function affiliate(overrides: Partial<AffiliateProfile>): AffiliateProfile {
  return {
    id: "aff-x",
    affiliate_code: "AFFX0000",
    status: "active",
    joined_at: "2026-01-01T00:00:00Z",
    activated_at: "2026-01-02T00:00:00Z",
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function page(
  data: AffiliateProfile[],
  currentPage: number,
  lastPage: number,
  total = data.length,
): PaginatedResponse<AffiliateProfile> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 20, total } };
}

function invitationsPage(data: Invitation[]): PaginatedResponse<Invitation> {
  return { data, meta: { current_page: 1, last_page: 1, per_page: 10, total: data.length } };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderNetwork(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <NetworkScreen />
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
  mockedFetchMySponsor.mockResolvedValue(SPONSOR);
  mockedFetchMyPlacementParent.mockResolvedValue(PLACEMENT_PARENT);
  mockedFetchMySponsored.mockResolvedValue(page([affiliate({ id: "aff-s1", affiliate_code: "SPOD0001" })], 1, 1));
  mockedFetchMyPlacementChildren.mockResolvedValue(
    page([affiliate({ id: "aff-p1", affiliate_code: "PLAC0001" })], 1, 1),
  );
  mockedFetchMyInvitations.mockResolvedValue(invitationsPage([]));
});

afterEach(() => {
  queryClient.clear();
});

describe("Network: active affiliate", () => {
  it("shows the summary, sponsor, placement parent, sponsored, placement children, and invitations sections", async () => {
    const { findByText } = await renderNetwork();

    expect(await findByText("MEEE1000")).toBeTruthy();
    expect(await findByText("Sonia Sponsor")).toBeTruthy();
    expect(await findByText("Paula Parent")).toBeTruthy();
    expect(await findByText("SPOD0001")).toBeTruthy();
    expect(await findByText("PLAC0001")).toBeTruthy();
    expect(await findByText("My invitations")).toBeTruthy();
  });

  it("fires network_viewed with no properties", async () => {
    await renderNetwork();
    expect(mockedCapture).toHaveBeenCalledWith("network_viewed");
    const call = mockedCapture.mock.calls.find(([event]) => event === "network_viewed");
    expect(call).toHaveLength(1);
  });
});

describe("Network: sponsor vs placement distinction", () => {
  it("renders sponsor and placement parent as distinct, differently-labeled affiliates when they differ", async () => {
    const { findByText } = await renderNetwork();

    expect(await findByText(/who recruited you/i)).toBeTruthy();
    expect(await findByText(/can differ from your sponsor/i)).toBeTruthy();
    // Different people entirely -- proves the UI never conflates the two.
    expect(await findByText("SPON5000")).toBeTruthy();
    expect(await findByText("PLAC6000")).toBeTruthy();
  });

  it("shows a clean root state when there's no sponsor, independent of placement parent", async () => {
    mockedFetchMySponsor.mockResolvedValue(null);
    const { findByText } = await renderNetwork();

    expect(await findByText("You're at the root of this network")).toBeTruthy();
    // Placement parent is unaffected by sponsor being null.
    expect(await findByText("Paula Parent")).toBeTruthy();
  });

  it("shows a clean root state when there's no placement parent", async () => {
    mockedFetchMyPlacementParent.mockResolvedValue(null);
    const { findByText } = await renderNetwork();

    expect(await findByText("You're at the top of the placement structure")).toBeTruthy();
  });
});

describe("Network: invitations", () => {
  it("shows masked contacts and effective statuses, never raw email/phone", async () => {
    mockedFetchMyInvitations.mockResolvedValue(
      invitationsPage([
        {
          id: "inv-1",
          status: "pending",
          masked_email: "j***@example.com",
          masked_phone: null,
          created_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-01-08T00:00:00Z",
          accepted_at: null,
        },
        {
          id: "inv-2",
          status: "accepted",
          masked_email: null,
          masked_phone: "***78",
          created_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-01-08T00:00:00Z",
          accepted_at: "2026-01-02T00:00:00Z",
        },
      ]),
    );
    const { findByText, queryByText } = await renderNetwork();

    expect(await findByText("j***@example.com")).toBeTruthy();
    expect(await findByText("***78")).toBeTruthy();
    expect(await findByText("Pending")).toBeTruthy();
    expect(await findByText("Accepted")).toBeTruthy();
    expect(queryByText("jane@example.com")).toBeNull();
    expect(queryByText("+525512345678")).toBeNull();
  });

  it("shows expired and revoked statuses distinctly", async () => {
    mockedFetchMyInvitations.mockResolvedValue(
      invitationsPage([
        {
          id: "inv-3",
          status: "expired",
          masked_email: "e***@example.com",
          masked_phone: null,
          created_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-01-02T00:00:00Z",
          accepted_at: null,
        },
        {
          id: "inv-4",
          status: "revoked",
          masked_email: "r***@example.com",
          masked_phone: null,
          created_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-01-08T00:00:00Z",
          accepted_at: null,
        },
      ]),
    );
    const { findByText } = await renderNetwork();

    expect(await findByText("Expired")).toBeTruthy();
    expect(await findByText("Revoked")).toBeTruthy();
  });

  it("shows an empty state with no invitations", async () => {
    const { findByText } = await renderNetwork();
    expect(await findByText("No invitations sent yet")).toBeTruthy();
  });
});

describe("Network: pagination", () => {
  it("loads the next page on 'Load more' and appends without duplicates", async () => {
    mockedFetchMySponsored.mockImplementation((pageNum: number) =>
      Promise.resolve(
        pageNum === 1
          ? page(
              [affiliate({ id: "aff-s1", affiliate_code: "SPOD0001" }), affiliate({ id: "aff-s2", affiliate_code: "SPOD0002" })],
              1,
              2,
              3,
            )
          : page(
              // aff-s2 repeated across pages (defensive dedupe target) plus one genuinely new item.
              [affiliate({ id: "aff-s2", affiliate_code: "SPOD0002" }), affiliate({ id: "aff-s3", affiliate_code: "SPOD0003" })],
              2,
              2,
              3,
            ),
      ),
    );

    const { findByText, findByLabelText, queryAllByText } = await renderNetwork();
    expect(await findByText("SPOD0001")).toBeTruthy();
    expect(await findByText("SPOD0002")).toBeTruthy();

    const loadMore = await findByLabelText("Load more direct sponsored");
    await act(async () => {
      fireEvent.press(loadMore);
    });

    expect(await findByText("SPOD0003")).toBeTruthy();
    expect(queryAllByText("SPOD0002")).toHaveLength(1); // deduped, not doubled
    expect(mockedFetchMySponsored).toHaveBeenCalledWith(2);
  });

  it("fires network_load_more tagged by section, with no identifying data", async () => {
    mockedFetchMySponsored.mockImplementation((pageNum: number) =>
      Promise.resolve(
        pageNum === 1
          ? page([affiliate({ id: "aff-s1", affiliate_code: "SPOD0001" })], 1, 2, 2)
          : page([affiliate({ id: "aff-s2", affiliate_code: "SPOD0002" })], 2, 2, 2),
      ),
    );
    const { findByLabelText } = await renderNetwork();
    const loadMore = await findByLabelText("Load more direct sponsored");
    await act(async () => {
      fireEvent.press(loadMore);
    });

    const call = mockedCapture.mock.calls.find(([event]) => event === "network_load_more");
    expect(call).toEqual(["network_load_more", { section: "sponsored" }]);
  });

  it("hides 'Load more' once the last page has loaded", async () => {
    mockedFetchMySponsored.mockResolvedValue(page([affiliate({ id: "aff-s1", affiliate_code: "SPOD0001" })], 1, 1, 1));
    const { findByText, queryByLabelText } = await renderNetwork();
    await findByText("SPOD0001");
    expect(queryByLabelText("Load more direct sponsored")).toBeNull();
  });
});

describe("Network: partial failure", () => {
  it("shows an error in one section without blocking the rest of the screen", async () => {
    mockedFetchMySponsored.mockRejectedValue(new ApiError("server", "Something broke.", 500));
    const { findByText } = await renderNetwork();

    expect(await findByText(/Something went wrong/, undefined, { timeout: 8000 })).toBeTruthy();
    // Everything else still renders.
    expect(await findByText("PLAC0001")).toBeTruthy();
    expect(await findByText("Sonia Sponsor")).toBeTruthy();
  });
});

describe("Network: no affiliate profile", () => {
  it("shows an enrollment message instead of network content", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderNetwork();

    expect(await findByText("Join the affiliate program")).toBeTruthy();
    expect(queryByText("My invitations")).toBeNull();
  });
});

describe("Network: organization switching", () => {
  it("never shows Org A's network data after switching to Org B", async () => {
    mockedFetchMySponsored.mockImplementation(() =>
      Promise.resolve(page([affiliate({ id: "aff-orga", affiliate_code: "ORGA0001" })], 1, 1)),
    );

    const { findByText, queryByText, rerender } = await renderNetwork(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText("ORGA0001")).toBeTruthy();

    mockedFetchMySponsored.mockImplementation(() =>
      Promise.resolve(page([affiliate({ id: "aff-orgb", affiliate_code: "ORGB0001" })], 1, 1)),
    );

    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <NetworkScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("ORGB0001")).toBeTruthy();
    expect(queryByText("ORGA0001")).toBeNull();
  });
});

describe("Network: referral CTA", () => {
  it("navigates to the referral screen and fires network_invite_pressed", async () => {
    const { findByText } = await renderNetwork();
    const button = await findByText("Invite someone");

    await act(async () => {
      fireEvent.press(button);
    });

    expect(mockRouter.push).toHaveBeenCalledWith("/referral");
    expect(mockedCapture).toHaveBeenCalledWith("network_invite_pressed");
  });
});

describe("Network: affiliate detail navigation", () => {
  it("navigates to the affiliate detail route and fires network_affiliate_opened with no identifying data", async () => {
    mockedFetchMySponsored.mockResolvedValue(
      page([affiliate({ id: "aff-detail-1", affiliate_code: "DETL0001" })], 1, 1),
    );
    const { findByText } = await renderNetwork();
    const row = await findByText("DETL0001");

    await act(async () => {
      fireEvent.press(row);
    });

    expect(mockRouter.push).toHaveBeenCalledWith("/network-affiliate/aff-detail-1");
    const call = mockedCapture.mock.calls.find(([event]) => event === "network_affiliate_opened");
    expect(call).toHaveLength(1); // event name only -- no uuid/code/name
  });
});

describe("Network: privacy", () => {
  it("never renders email, phone, or financial data anywhere on the screen", async () => {
    const { queryByText } = await renderNetwork();
    expect(queryByText(/@example\.com/)).toBeNull();
    expect(queryByText(/\$\d/)).toBeNull();
  });
});
