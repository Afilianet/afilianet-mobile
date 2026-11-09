import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Linking, Share } from "react-native";
import { fetchMyAffiliateProfile } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile, Organization } from "../../types/api";
import ReferralScreen from "../../app/referral";

const mockBack = jest.fn();
const mockPush = jest.fn();

// Staging: the referral link is public HTTPS, so it is tappable in a chat.
jest.mock("../../config/env", () => {
  const actual = jest.requireActual("../../config/env");
  return { ...actual, config: { ...actual.config, appEnv: "staging" } };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
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
  my_role: "owner",
  my_membership_status: "active",
};

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

function affiliate(overrides: Partial<AffiliateProfile> = {}): AffiliateProfile {
  return {
    id: "aff-1",
    affiliate_code: "AFF100",
    status: "active",
    sponsor: null,
    joined_at: "2026-01-01T00:00:00Z",
    activated_at: "2026-01-02T00:00:00Z",
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

let queryClient: QueryClient;

async function renderReferral() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue()}>
          <ReferralScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
});

const STAGING_URL = "https://staging-admin.afilianet.mx/join/org-1/AFF100";

describe("Referral: share on WhatsApp (staging, public HTTPS link)", () => {
  it("opens wa.me with the prefilled message and referral link - no recipient, nothing sent by the app", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText } = await renderReferral();

    const button = await findByText("Compartir por WhatsApp");
    await act(async () => {
      fireEvent.press(button);
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent(`Únete a Afilianet: ${STAGING_URL}`)}`);
    expect(shareSpy).not.toHaveBeenCalled();
    expect(mockedCapture).toHaveBeenCalledWith("referral_whatsapp_opened");

    openSpy.mockRestore();
    shareSpy.mockRestore();
  });

  it("falls back to the system share sheet when WhatsApp cannot be opened", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler") as never);
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText } = await renderReferral();

    await act(async () => {
      fireEvent.press(await findByText("Compartir por WhatsApp"));
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0].message).toContain(STAGING_URL);

    openSpy.mockRestore();
    shareSpy.mockRestore();
  });

  it("does not offer WhatsApp when sharing is not allowed for the affiliate", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate({ status: "suspended" }));
    const { findByText, queryByText } = await renderReferral();

    expect(await findByText("AFF100")).toBeTruthy();
    expect(queryByText("Compartir por WhatsApp")).toBeNull();
  });
});
