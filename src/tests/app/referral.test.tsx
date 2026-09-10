import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import { ApiError } from "../../api/errors";
import { fetchMyAffiliateProfile } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile, Organization } from "../../types/api";
import ReferralScreen from "../../app/referral";

const mockBack = jest.fn();
const mockPush = jest.fn();

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
const mockedSetStringAsync = Clipboard.setStringAsync as jest.Mock;
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

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

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

describe("Referral: active affiliate", () => {
  it("shows the affiliate code, the exact referral URL, a QR code, and Share/Copy actions", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText, getByLabelText } = await renderReferral();

    expect(await findByText("AFF100")).toBeTruthy();
    expect(await findByText("https://app.afilianet.mx/join/AFF100")).toBeTruthy();
    expect(getByLabelText(/Código QR para tu liga de referido/)).toBeTruthy();
    expect(await findByText("Compartir")).toBeTruthy();
    expect(await findByText("Copiar liga")).toBeTruthy();
  });

  it("fires referral_screen_viewed and referral_qr_viewed with no properties", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    await renderReferral();

    await waitFor(() => expect(mockedCapture).toHaveBeenCalledWith("referral_qr_viewed"));
    expect(mockedCapture).toHaveBeenCalledWith("referral_screen_viewed");

    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1); // event name only -- no properties object at all
    }
  });
});

describe("Referral: pending affiliate", () => {
  it("still shows a working referral link and communicates onboarding status", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate({ status: "pending" }));
    const { findByText } = await renderReferral();

    expect(await findByText("Pendiente")).toBeTruthy();
    expect(await findByText(/tu liga de referido ya funciona/i)).toBeTruthy();
    expect(await findByText("https://app.afilianet.mx/join/AFF100")).toBeTruthy();
    expect(await findByText("Compartir")).toBeTruthy();
  });
});

describe("Referral: suspended affiliate", () => {
  it("disables sharing entirely -- no URL, QR, Share, or Copy", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate({ status: "suspended" }));
    const { findByText, queryByText, queryByLabelText } = await renderReferral();

    expect(await findByText("Suspendido")).toBeTruthy();
    expect(await findByText(/compartir no está disponible/i)).toBeTruthy();
    expect(queryByText("https://app.afilianet.mx/join/AFF100")).toBeNull();
    expect(queryByText("Compartir")).toBeNull();
    expect(queryByText("Copiar liga")).toBeNull();
    expect(queryByLabelText(/QR code/)).toBeNull();
  });
});

describe("Referral: terminated affiliate", () => {
  it("disables sharing entirely", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate({ status: "terminated" }));
    const { findByText, queryByText } = await renderReferral();

    expect(await findByText("Terminado")).toBeTruthy();
    expect(queryByText("Compartir")).toBeNull();
    expect(queryByText("Copiar liga")).toBeNull();
  });
});

describe("Referral: copy link", () => {
  it("copies the exact referral URL and fires referral_link_copied with no properties", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText } = await renderReferral();

    const copyButton = await findByText("Copiar liga");
    await act(async () => {
      fireEvent.press(copyButton);
    });

    expect(mockedSetStringAsync).toHaveBeenCalledWith("https://app.afilianet.mx/join/AFF100");
    expect(mockedCapture).toHaveBeenCalledWith("referral_link_copied");
    const copyCall = mockedCapture.mock.calls.find(([event]) => event === "referral_link_copied");
    expect(copyCall).toHaveLength(1);

    expect(await findByText("Liga copiada")).toBeTruthy();
  });
});

describe("Referral: share", () => {
  it("opens the native share sheet with the referral URL and neutral text, and fires referral_share_opened with no properties", async () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText } = await renderReferral();

    const shareButton = await findByText("Compartir");
    await act(async () => {
      fireEvent.press(shareButton);
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const [shareContent] = shareSpy.mock.calls[0];
    expect(shareContent.message).toContain("https://app.afilianet.mx/join/AFF100");

    expect(mockedCapture).toHaveBeenCalledWith("referral_share_opened");
    const shareCall = mockedCapture.mock.calls.find(([event]) => event === "referral_share_opened");
    expect(shareCall).toHaveLength(1);

    shareSpy.mockRestore();
  });
});

describe("Referral: no affiliate profile", () => {
  it("shows an enrollment message instead of referral content", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderReferral();

    expect(await findByText("Únete al programa de afiliados")).toBeTruthy();
    expect(queryByText("Compartir")).toBeNull();
  });
});

describe("Referral: loading and error", () => {
  it("shows a skeleton before data resolves", async () => {
    let resolveAffiliate!: (value: AffiliateProfile) => void;
    mockedFetchMyAffiliateProfile.mockReturnValue(
      new Promise<AffiliateProfile>((resolve) => {
        resolveAffiliate = resolve;
      }),
    );

    const { queryByText, findByText, getByTestId } = await renderReferral();
    expect(queryByText("AFF100")).toBeNull();
    expect(getByTestId("section-skeleton")).toBeTruthy();

    await act(async () => {
      resolveAffiliate(affiliate());
    });
    expect(await findByText("AFF100")).toBeTruthy();
  });

  it(
    "shows an offline error with a working retry",
    async () => {
      mockedFetchMyAffiliateProfile.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
      const { findByText, getByText } = await renderReferral();
      expect(await findByText(/conexión/i, undefined, { timeout: 8000 })).toBeTruthy();

      mockedFetchMyAffiliateProfile.mockResolvedValueOnce(affiliate());
      fireEvent.press(getByText("Intenta de nuevo"));
      expect(await findByText("AFF100")).toBeTruthy();
    },
    15000,
  );
});

describe("Referral: invitations section", () => {
  it("points to the real invitations list on Network instead of duplicating it", async () => {
    mockedFetchMyAffiliateProfile.mockResolvedValue(affiliate());
    const { findByText, getByText } = await renderReferral();

    expect(await findByText("Mis invitaciones")).toBeTruthy();
    expect(await findByText(/a quién has invitado/i)).toBeTruthy();

    fireEvent.press(getByText("Ver invitaciones"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/network");
  });
});
