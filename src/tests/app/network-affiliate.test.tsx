import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchAffiliateDetails, fetchAffiliatePlacementChildren, fetchAffiliateSponsored } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, Organization, PaginatedResponse } from "../../types/api";
import AffiliateDetailScreen from "../../app/network-affiliate/[affiliateUuid]";

const mockBack = jest.fn();
let mockAffiliateUuid = "aff-target";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ affiliateUuid: mockAffiliateUuid }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchAffiliateDetails: jest.fn(),
  fetchAffiliateSponsored: jest.fn(),
  fetchAffiliatePlacementChildren: jest.fn(),
}));

const mockedFetchAffiliateDetails = fetchAffiliateDetails as jest.Mock;
const mockedFetchAffiliateSponsored = fetchAffiliateSponsored as jest.Mock;
const mockedFetchAffiliatePlacementChildren = fetchAffiliatePlacementChildren as jest.Mock;

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

const TARGET: AffiliateProfile = {
  id: "aff-target",
  affiliate_code: "TARG7000",
  status: "active",
  user: { id: "u-target", first_name: "Tara", last_name: "Target" },
  sponsor: { id: "aff-their-sponsor", affiliate_code: "SPON9000" },
  placement_parent: { id: "aff-their-placement", affiliate_code: "PLAC9000" },
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: "2026-01-02T00:00:00Z",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

function emptyPage(currentPage = 1): PaginatedResponse<AffiliateProfile> {
  return { data: [], meta: { current_page: currentPage, last_page: 1, per_page: 20, total: 0 } };
}

let queryClient: QueryClient;

async function renderDetail() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue()}>
          <AffiliateDetailScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAffiliateUuid = "aff-target";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchAffiliateSponsored.mockResolvedValue(emptyPage());
  mockedFetchAffiliatePlacementChildren.mockResolvedValue(emptyPage());
});

afterEach(() => {
  queryClient.clear();
});

describe("Affiliate detail: success", () => {
  it("shows the affiliate's identity, sponsor, and placement parent", async () => {
    mockedFetchAffiliateDetails.mockResolvedValue(TARGET);
    const { findByText } = await renderDetail();

    expect(await findByText("Tara Target")).toBeTruthy();
    expect(await findByText("TARG7000")).toBeTruthy();
    expect(await findByText("SPON9000")).toBeTruthy();
    expect(await findByText("PLAC9000")).toBeTruthy();
  });

  it("fetches this affiliate's own sponsored and placement-children lists, not the viewer's", async () => {
    mockedFetchAffiliateDetails.mockResolvedValue(TARGET);
    await renderDetail();

    await waitFor(() => expect(mockedFetchAffiliateSponsored).toHaveBeenCalledWith("aff-target", 1));
    expect(mockedFetchAffiliatePlacementChildren).toHaveBeenCalledWith("aff-target", 1);
  });
});

describe("Affiliate detail: 403", () => {
  it("shows a clean forbidden state instead of a generic error when the backend denies access", async () => {
    mockedFetchAffiliateDetails.mockRejectedValue(new ApiError("forbidden", "This action is unauthorized.", 403));
    const { findByText, queryByText } = await renderDetail();

    expect(await findByText("Error 403")).toBeTruthy();
    // No generic/technical error copy leaking through for what is an expected, policy-driven outcome.
    expect(queryByText(/didn't load/i)).toBeNull();
  });

  it("does not fetch this affiliate's sponsored/placement-children lists when the detail fetch is forbidden", async () => {
    mockedFetchAffiliateDetails.mockRejectedValue(new ApiError("forbidden", "This action is unauthorized.", 403));
    await renderDetail();

    expect(mockedFetchAffiliateSponsored).not.toHaveBeenCalled();
    expect(mockedFetchAffiliatePlacementChildren).not.toHaveBeenCalled();
  });
});

describe("Affiliate detail: not found", () => {
  it("shows a not-found message for an unknown affiliate id", async () => {
    mockedFetchAffiliateDetails.mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
    const { findByText } = await renderDetail();
    expect(await findByText("Not found")).toBeTruthy();
  });
});

describe("Affiliate detail: loading and error", () => {
  it("shows a skeleton before data resolves", async () => {
    let resolve!: (value: AffiliateProfile) => void;
    mockedFetchAffiliateDetails.mockReturnValue(
      new Promise<AffiliateProfile>((r) => {
        resolve = r;
      }),
    );
    const { queryByText, findByText, getByTestId } = await renderDetail();
    expect(queryByText("TARG7000")).toBeNull();
    expect(getByTestId("section-skeleton")).toBeTruthy();

    await act(async () => {
      resolve(TARGET);
    });
    expect(await findByText("TARG7000")).toBeTruthy();
  });

  it(
    "shows an offline error with a working retry",
    async () => {
      mockedFetchAffiliateDetails.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
      const { findByText, getByText } = await renderDetail();
      expect(await findByText(/offline/i, undefined, { timeout: 8000 })).toBeTruthy();

      mockedFetchAffiliateDetails.mockResolvedValueOnce(TARGET);
      await act(async () => {
        fireEvent.press(getByText("Try again"));
      });
      expect(await findByText("TARG7000")).toBeTruthy();
    },
    15000,
  );
});

describe("Affiliate detail: privacy", () => {
  it("never renders email, phone, or financial data for the viewed affiliate", async () => {
    mockedFetchAffiliateDetails.mockResolvedValue(TARGET);
    const { queryByText, findByText } = await renderDetail();
    await findByText("Tara Target");

    expect(queryByText(/@/)).toBeNull();
    expect(queryByText(/\$\d/)).toBeNull();
  });
});
