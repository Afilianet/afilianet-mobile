import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor as rawWaitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { configureApiClient } from "../../api/client";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Organization } from "../../types/api";
import HomeScreen from "../../app/(app)/index";
import NetworkScreen from "../../app/(app)/network";
import ProfileScreen from "../../app/(app)/profile";
import ComplianceScreen from "../../app/compliance";

/**
 * API #75 (docs/organizations/STAFF_SIN_PERFIL_DE_AFILIADO.md) with the REAL
 * screens, hooks and API client; only fetch is simulated, as one API that
 * answers per organization (X-Organization-ID):
 * - org-staff: this account is owner and has NO affiliate profile;
 * - org-aff: this account is an affiliate with a profile.
 * Every request is recorded, so the tests assert what is NOT requested.
 */
jest.setTimeout(30_000);
const waitFor = (expectation: () => unknown) => rawWaitFor(expectation, { timeout: 5000 });

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://staging-api.test", apiTimeoutMs: 5000, appEnv: "staging" } }));
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual("react").useEffect(effect, [effect]),
}));
// Stable, like the app's auth state: a new object per render would re-run focus effects forever.
jest.mock("../../auth/AuthContext", () => {
  const auth = { user: { id: "user-1", first_name: "Andrea", last_name: "Gestora", email: "a@example.test", email_verified_at: "x" } };
  return { useAuth: () => auth };
});
jest.mock("../../features/surveys/signOut", () => ({ useSafeSignOut: () => jest.fn() }));
jest.mock("../../services/assistedQueue", () => ({ listPendingAssisted: jest.fn(async () => []), syncPendingAssisted: jest.fn() }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

const base = { slug: "s", legal_name: null, status: "active", timezone: "America/Mexico_City", locale: "es", currency: "MXN", metadata: null, created_at: "x", updated_at: "x", my_membership_status: "active" };
const STAFF_ORG = { ...base, id: "org-staff", name: "Organización que administro", my_role: "owner", has_affiliate_profile: false } as Organization;
const AFF_ORG = { ...base, id: "org-aff", name: "Organización donde soy afiliada", my_role: "affiliate", has_affiliate_profile: true } as Organization;
const MANAGER_WITH_PROFILE = { ...base, id: "org-aff", name: "Organización donde gestiono y soy afiliada", my_role: "manager", has_affiliate_profile: true } as Organization;
const OLD_API_ORG = { ...base, id: "org-aff", name: "Organización (API anterior)", my_role: "owner" } as Organization;

const affiliate = (id: string, first: string, last: string, code: string) => ({
  id,
  user: { id: `u-${id}`, first_name: first, last_name: last },
  affiliate_code: code,
  status: "active",
  sponsor: null,
  placement_parent: null,
  placement_position: null,
  joined_at: "2026-10-01T10:00:00Z",
  activated_at: "2026-10-02T10:00:00Z",
  metadata: null,
  created_at: "2026-10-01T10:00:00Z",
});
const ORG_AFFILIATES = [affiliate("aaaaaaaa-0000-4000-8000-000000000001", "Ana", "López", "ANA1"), affiliate("aaaaaaaa-0000-4000-8000-000000000002", "Beto", "Ruiz", "BETO2")];
const page = (data: unknown[]) => ({ data, links: {}, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const requests: { path: string; organization: string | undefined }[] = [];
let staffRoleRevoked = false;
function serve(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = (init.headers ?? {}) as Record<string, string>;
  const organization = headers["X-Organization-ID"];
  const path = url.replace("https://staging-api.test", "");
  requests.push({ path, organization });
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (route === "/api/v1/notifications/unread-count") return Promise.resolve(json(200, { data: { count: 0 } }));
  if (route === "/api/v1/affiliates") {
    if (organization !== "org-staff" || staffRoleRevoked) return Promise.resolve(json(403, { message: "This action is unauthorized." }));
    const search = (params.get("search") ?? "").toLowerCase();
    return Promise.resolve(json(200, page(ORG_AFFILIATES.filter((row) => !search || `${row.user.first_name} ${row.user.last_name} ${row.affiliate_code}`.toLowerCase().includes(search)))));
  }
  // Personal endpoints: no profile in org-staff → 404 "No encontrado." (never reached by the app).
  if (route.startsWith("/api/v1/affiliates/me") || route === "/api/v1/compliance") {
    if (organization === "org-staff") return Promise.resolve(json(404, { message: "No encontrado." }));
    if (route === "/api/v1/affiliates/me") return Promise.resolve(json(200, { data: affiliate("bbbbbbbb-0000-4000-8000-000000000001", "Andrea", "Afiliada", "ANDREA9") }));
    if (route === "/api/v1/compliance") return Promise.resolve(json(404, { message: "No encontrado." }));
    if (route.endsWith("/sponsor") || route.endsWith("/placement-parent")) return Promise.resolve(json(200, { data: null }));
    return Promise.resolve(json(200, page([])));
  }
  if (route.startsWith("/api/v1/affiliates/")) return Promise.resolve(json(200, page([])));
  return Promise.resolve(json(404, { message: "No encontrado." }));
}

const PERSONAL = /^\/api\/v1\/(affiliates\/me|compliance|wallet|commissions|sales|payout)/;
const personalRequests = (organization: string) => requests.filter((request) => request.organization === organization && PERSONAL.test(request.path));
const managementRequests = () => requests.filter((request) => request.path.startsWith("/api/v1/affiliates?"));

const originalFetch = global.fetch;
let queryClient: QueryClient;
let currentOrganizationId = "org-staff";

function orgValue(active: Organization, organizations: Organization[] = [STAFF_ORG, AFF_ORG]): OrganizationContextValue {
  return { status: "ready", organizations, activeOrganization: active, error: null, selectOrganization: jest.fn(), refresh: jest.fn() } as unknown as OrganizationContextValue;
}

function tree(screen: ReactElement, active: Organization) {
  return (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(active)}>{screen}</OrganizationContext.Provider>
    </QueryClientProvider>
  );
}

async function show(screen: ReactElement, active: Organization) {
  currentOrganizationId = active.id;
  let rendered!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    rendered = await render(tree(screen, active));
  });
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  requests.length = 0;
  staffRoleRevoked = false;
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  global.fetch = jest.fn(serve) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => currentOrganizationId });
});
afterEach(() => {
  queryClient.clear();
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

describe("Staff without an affiliate profile (has_affiliate_profile: false)", () => {
  it("Home: says what the account is and where its work is; no personal card, no «No iniciado», no «Comenzar verificación», no personal request", async () => {
    const screen = await show(<HomeScreen />, STAFF_ORG);
    await waitFor(() => expect(screen.getByTestId("home-staff-without-profile")).toBeTruthy());
    expect(screen.getByText("Esta cuenta administra la organización; no tiene perfil de afiliado.")).toBeTruthy();
    expect(screen.queryByText(/No iniciado/)).toBeNull();
    expect(screen.queryByText("Comenzar verificación")).toBeNull();
    expect(screen.queryByText("Únete al programa de afiliados")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Ver afiliados de la organización"));
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/(app)/network");
    expect(personalRequests("org-staff")).toEqual([]);
  });

  it("Home: pull to refresh never re-requests personal data (refetch ignores `enabled`)", async () => {
    const screen = await show(<HomeScreen />, STAFF_ORG);
    await waitFor(() => expect(screen.getByTestId("home-staff-without-profile")).toBeTruthy());
    await act(async () => {
      await screen.getByTestId("home-scroll").props.refreshControl.props.onRefresh();
    });
    expect(requests.filter((request) => request.path === "/api/v1/notifications/unread-count").length).toBeGreaterThanOrEqual(2);
    expect(personalRequests("org-staff")).toEqual([]);
  });

  it("Mi red: the organization's affiliates, searchable, each opening its own profile and network; no personal network and no assisted enrollment", async () => {
    const screen = await show(<NetworkScreen />, STAFF_ORG);
    await waitFor(() => expect(screen.getByText("Ana López")).toBeTruthy());
    expect(screen.getByText("Beto Ruiz")).toBeTruthy();
    expect(screen.queryByText("Registrar a alguien")).toBeNull();
    expect(managementRequests()).toEqual([{ path: "/api/v1/affiliates?per_page=20&page=1", organization: "org-staff" }]);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("organization-affiliates-search"), "Beto");
    });
    // Searched on the server, after the typing settles.
    await waitFor(() => {
      expect(screen.getByText("Beto Ruiz")).toBeTruthy();
      expect(screen.queryByText("Ana López")).toBeNull();
    });
    expect(managementRequests().at(-1)).toEqual({ path: "/api/v1/affiliates?per_page=20&page=1&search=Beto", organization: "org-staff" });

    await act(async () => {
      fireEvent.press(screen.getByText("Beto Ruiz"));
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/network-affiliate/aaaaaaaa-0000-4000-8000-000000000002");
    expect(personalRequests("org-staff")).toEqual([]);
    expect(requests.some((request) => request.path.includes("assisted-enrollments"))).toBe(false);
    const { listPendingAssisted } = jest.requireMock("../../services/assistedQueue") as { listPendingAssisted: jest.Mock };
    expect(listPendingAssisted).not.toHaveBeenCalled();
  });

  it("Mi red: the API still decides -- a role revoked server-side shows «no permission», not someone else's data", async () => {
    staffRoleRevoked = true;
    const screen = await show(<NetworkScreen />, STAFF_ORG);
    await waitFor(() => expect(screen.getByText(/403/)).toBeTruthy());
    expect(screen.queryByText("Ana López")).toBeNull();
  });

  it("Perfil: a neutral note, no affiliate or KYC block, no request", async () => {
    const profile = await show(<ProfileScreen />, STAFF_ORG);
    await waitFor(() => expect(profile.getByTestId("profile-staff-without-profile")).toBeTruthy());
    expect(profile.getByText("Esta cuenta administra la organización; no tiene perfil de afiliado.")).toBeTruthy();
    expect(profile.queryByText(/No iniciado/)).toBeNull();
    expect(personalRequests("org-staff")).toEqual([]);
  });

  it("Verificación: nothing to start, a neutral «not available for this account», no request", async () => {
    const compliance = await show(<ComplianceScreen />, STAFF_ORG);
    expect(compliance.getByTestId("personal-affiliate-unavailable")).toBeTruthy();
    expect(compliance.getByText("No disponible para esta cuenta: no tiene perfil de afiliado en esta organización.")).toBeTruthy();
    expect(compliance.queryByText("Comenzar verificación")).toBeNull();
    await act(async () => {});
    expect(personalRequests("org-staff")).toEqual([]);
  });
});

describe("Affiliate with a profile (has_affiliate_profile: true)", () => {
  it("keeps the personal experience as it was, and never asks for the management list", async () => {
    const home = await show(<HomeScreen />, AFF_ORG);
    await waitFor(() => expect(home.getByText("ANDREA9")).toBeTruthy());
    expect(home.queryByTestId("home-staff-without-profile")).toBeNull();
    expect(home.queryByText("Ver afiliados de la organización")).toBeNull();
    expect(personalRequests("org-aff").map((request) => request.path)).toEqual(expect.arrayContaining(["/api/v1/affiliates/me", "/api/v1/compliance"]));
  });

  it("Mi red keeps the personal network and never asks for the management list", async () => {
    const network = await show(<NetworkScreen />, AFF_ORG);
    await waitFor(() => expect(network.getByText("Registrar a alguien")).toBeTruthy());
    expect(network.queryByText("Ver afiliados de la organización")).toBeNull();
    expect(managementRequests()).toEqual([]);
  });

  it("staff WITH a profile keep their own network and also get the organization's affiliates", async () => {
    const network = await show(<NetworkScreen />, MANAGER_WITH_PROFILE);
    await waitFor(() => expect(network.getByText("Registrar a alguien")).toBeTruthy());
    await act(async () => {
      fireEvent.press(network.getByText("Ver afiliados de la organización"));
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/organization-affiliates");
  });
});

describe("Compatibility: an API without has_affiliate_profile", () => {
  it("treats the missing field as unknown, never as «no profile»: the screens ask and show what they always did", async () => {
    const home = await show(<HomeScreen />, OLD_API_ORG);
    await waitFor(() => expect(home.getByText("ANDREA9")).toBeTruthy());
    expect(home.queryByTestId("home-staff-without-profile")).toBeNull();
    expect(personalRequests("org-aff").length).toBeGreaterThan(0);
  });
});

describe("Switching organization", () => {
  it("from a managed one to one where the account is an affiliate and back: context, search and requests follow the active organization", async () => {
    const screen = await show(<NetworkScreen />, STAFF_ORG);
    await waitFor(() => expect(screen.getByText("Ana López")).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("organization-affiliates-search"), "Ana");
    });

    currentOrganizationId = "org-aff";
    requests.length = 0;
    await act(async () => {
      screen.rerender(tree(<NetworkScreen />, AFF_ORG));
    });
    await waitFor(() => expect(screen.getByText("Registrar a alguien")).toBeTruthy());
    expect(screen.queryByTestId("organization-affiliates-search")).toBeNull();
    expect(screen.queryByText("Ana López")).toBeNull();
    expect(managementRequests()).toEqual([]);
    expect(requests.every((request) => request.organization === "org-aff")).toBe(true);

    currentOrganizationId = "org-staff";
    requests.length = 0;
    await act(async () => {
      screen.rerender(tree(<NetworkScreen />, STAFF_ORG));
    });
    await waitFor(() => expect(screen.getByText("Beto Ruiz")).toBeTruthy());
    // The search typed before the switch is gone: the full list again.
    expect(screen.getByTestId("organization-affiliates-search").props.value).toBe("");
    expect(personalRequests("org-staff")).toEqual([]);
  });
});
