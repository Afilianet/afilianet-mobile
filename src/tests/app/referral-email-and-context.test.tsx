import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking, Share } from "react-native";
import { fetchMyAffiliateProfile } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, Organization } from "../../types/api";
import ReferralScreen from "../../app/referral";

/**
 * Referral sharing beyond #66's WhatsApp tests (referral-whatsapp.test.tsx):
 * email, what each fallback says, the link never belonging to another
 * organization, and accounts without a referral link.
 */
// Staging by default (public HTTPS landing); one test switches the same object to development.
jest.mock("../../config/env", () => {
  const actual = jest.requireActual("../../config/env");
  return { ...actual, config: { ...actual.config, appEnv: "staging" } };
});
const env = (jest.requireMock("../../config/env") as { config: { appEnv: string } }).config;
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../api/endpoints", () => ({ fetchMyAffiliateProfile: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

const base = { slug: "s", legal_name: null, status: "active", timezone: "UTC", locale: "es", currency: "MXN", metadata: null, created_at: "x", updated_at: "x", my_role: "affiliate", my_membership_status: "active" };
const ORG_1 = { ...base, id: "org-1", name: "Red Norte", has_affiliate_profile: true } as Organization;
const ORG_2 = { ...base, id: "org-2", name: "Red Sur", has_affiliate_profile: true } as Organization;

const affiliate = (code: string, organizationId?: string): AffiliateProfile =>
  ({ id: `aff-${code}`, affiliate_code: code, status: "active", sponsor: null, joined_at: "x", activated_at: "x", metadata: null, created_at: "x", ...(organizationId ? { organization_id: organizationId } : {}) }) as AffiliateProfile;

const fetchProfile = fetchMyAffiliateProfile as jest.Mock;
let queryClient: QueryClient;

function orgValue(active: Organization): OrganizationContextValue {
  return { status: "ready", organizations: [ORG_1, ORG_2], activeOrganization: active, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
}
function tree(active: Organization) {
  return (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(active)}>
        <ReferralScreen />
      </OrganizationContext.Provider>
    </QueryClientProvider>
  );
}
async function renderReferral(active: Organization = ORG_1) {
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = await render(tree(active));
  });
  return view;
}

const URL_1 = "https://staging-admin.afilianet.mx/join/org-1/NORTE1";
const URL_2 = "https://staging-admin.afilianet.mx/join/org-2/SUR2";

beforeEach(() => {
  jest.clearAllMocks();
  env.appEnv = "staging";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchProfile.mockResolvedValue(affiliate("NORTE1", "org-1"));
});
afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe("Invite by email", () => {
  it("opens the mail app with subject and message ready (this organization's link); the person picks the recipient and sends", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    const view = await renderReferral();
    await act(async () => {
      fireEvent.press(await view.findByText("Invitar por correo"));
    });

    expect(open).toHaveBeenCalledTimes(1);
    const mailto = open.mock.calls[0][0] as string;
    expect(mailto.startsWith("mailto:?subject=")).toBe(true);
    const params = new URLSearchParams(mailto.slice("mailto:?".length));
    expect(params.get("subject")).toBe("Te invito a unirte a Red Norte en Afilianet");
    expect(params.get("body")).toContain(URL_1);
    expect(share).not.toHaveBeenCalled();
    expect(view.getByText("Afilianet no envía estos mensajes: tú eliges a quién y confirmas el envío.")).toBeTruthy();
  });

  it.each([
    ["Invitar por correo", "No se pudo abrir el correo. Elige otra forma de compartir o copia la liga."],
    ["Compartir por WhatsApp", "No se pudo abrir WhatsApp. Elige otra forma de compartir o copia la liga."],
  ])("«%s» without an app that can open it: says so and offers the system share sheet with the same link", async (label, notice) => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler") as never);
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "dismissedAction" } as never);
    const view = await renderReferral();
    await act(async () => {
      fireEvent.press(await view.findByText(label));
    });

    expect(view.getByText(notice)).toBeTruthy();
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0][0] as { message: string }).message).toContain(URL_1);
  });

  it("with a link that is not public HTTPS (no web landing in this environment): explains why there is no email or WhatsApp, keeps share and copy", async () => {
    env.appEnv = "development";
    const view = await renderReferral();
    expect(await view.findByText(/Correo y WhatsApp necesitan la liga pública/)).toBeTruthy();
    expect(view.queryByText("Invitar por correo")).toBeNull();
    expect(view.queryByText("Compartir por WhatsApp")).toBeNull();
    expect(view.getByText("Compartir")).toBeTruthy();
    expect(view.getByText("Copiar liga")).toBeTruthy();
  });
});

describe("The link always belongs to the active organization", () => {
  it("after switching organization, only the new organization's link is shared -- never the previous one", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    let resolveSecond!: (value: AffiliateProfile) => void;
    const view = await renderReferral(ORG_1);
    expect(await view.findByText(URL_1)).toBeTruthy();

    fetchProfile.mockImplementation(() => new Promise((resolve) => (resolveSecond = resolve)));
    await act(async () => {
      view.rerender(tree(ORG_2));
    });
    // While the new organization's profile loads, nothing of the previous one is offered.
    expect(view.queryByText(URL_1)).toBeNull();
    expect(view.queryByText("Invitar por correo")).toBeNull();

    await act(async () => {
      resolveSecond(affiliate("SUR2", "org-2"));
    });
    await waitFor(() => expect(view.getByText(URL_2)).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByText("Compartir por WhatsApp"));
    });
    expect(open.mock.calls.at(-1)?.[0]).toContain(encodeURIComponent(URL_2));
    expect(open.mock.calls.at(-1)?.[0]).not.toContain(encodeURIComponent("NORTE1"));
  });

  it("a profile that states another organization is never turned into a link", async () => {
    fetchProfile.mockResolvedValue(affiliate("NORTE1", "org-1"));
    const view = await renderReferral(ORG_2);
    await act(async () => {});
    expect(view.queryByText(/join\/org-2\/NORTE1/)).toBeNull();
    expect(view.queryByText("Compartir por WhatsApp")).toBeNull();
  });
});

describe("Accounts without a referral link", () => {
  it("no affiliate profile in this organization (e.g. a superadmin or manager): a clear explanation, no code invented, nothing requested", async () => {
    const managerWithoutProfile = { ...ORG_1, my_role: "owner", has_affiliate_profile: false } as Organization;
    const view = await renderReferral(managerWithoutProfile);
    expect(view.getByText("No disponible para esta cuenta: no tiene perfil de afiliado en esta organización.")).toBeTruthy();
    expect(view.queryByText("Invitar por correo")).toBeNull();
    expect(view.queryByText(/join\//)).toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});
