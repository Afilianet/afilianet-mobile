import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { apiRequest, configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { ErrorState } from "../../components/ErrorState";
import { resolveRedirect } from "../../navigation/rootNavigationGuard";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { clearPrivacyReview, getPrivacyReview, reviewBlocks, syncPrivacyReview } from "../../state/privacyReview";
import type { PendingAssistedEnrollment } from "../../services/assistedQueue";
import { checkServerBeforeDiscard, discardConfirmation } from "../../utils/assistedPending";
import PrivacyReviewScreen from "../../app/privacy-review";

/**
 * API #93: reviewing notices inside the app, against simulated HTTP (the real
 * client; only global fetch is replaced). Documents and accounts are fictitious.
 */
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = false;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }),
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 200 } }));
jest.mock("../../features/surveys/signOut", () => ({ useSafeSignOut: () => mockSignOut }));
jest.mock("../../services/assistedQueue", () => ({ ...jest.requireActual("../../services/assistedQueue"), isAssistedSyncInProgress: () => false }));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));
const mockSignOut = jest.fn();

const sha = (char: string) => char.repeat(64);
const G1 = { version: "prueba-general.1", sha256: sha("a") };
const G2 = { version: "prueba-general.2", sha256: sha("b") };
const A1 = { version: "prueba-suplemento-a.1", sha256: sha("c") };
const B2 = { version: "prueba-suplemento-b.2", sha256: sha("d") };
function document(ref: { version: string; sha256: string }, purposes: unknown[] = []) {
  return {
    scope: "global", version: ref.version, controller_name: "Responsable ficticio", controller_address: "Domicilio ficticio",
    contact_email: "privacidad@example.test", deletion_response_days: 20, deletion_response_days_kind: "hábiles",
    sections: [{ title: `Texto de ${ref.version}`, text: "Documento FICTICIO." }], content_sha256: ref.sha256, purposes,
  };
}
type Action = "none" | "inform" | "review";
function entry(current: { version: string; sha256: string }, action: Action, extra: Record<string, unknown> = {}) {
  return {
    current, change_class: action === "inform" ? "informative" : action === "review" ? "review_required" : "initial",
    summary_of_changes: action === "none" ? null : `Cambio FICTICIO de ${current.version}.`, action_required: action,
    acknowledged_current: action === "none", last_acknowledged: null, purposes: [], ...extra,
  };
}
function status(general: Action, organizations: { id: string; name: string; current: { version: string; sha256: string }; action: Action }[] = [], enforce = true) {
  return {
    data: {
      required: true, enforce_review: enforce, privacy_notice: entry(general === "review" ? G2 : G1, general),
      organizations: organizations.map((org) => ({ id: org.id, name: org.name, ...entry(org.current, org.action) })),
    },
  };
}

type Answer = { status: number; body?: unknown };
let routes: Record<string, (() => Answer | Promise<Answer>)[]> = {};
const calls: { route: string; body: unknown; headers: Record<string, string> }[] = [];
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? "GET"} ${url.replace("https://api.test/api/v1", "")}`;
  calls.push({ route, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
  const queue = routes[route];
  if (!queue?.length) throw new Error(`Unexpected request ${route}`);
  const answer = await (queue.length > 1 ? queue.shift()! : queue[0])();
  return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
});
const on = (route: string, ...answers: (() => Answer | Promise<Answer>)[]) => { routes[route] = answers; };
const ok = (body: unknown) => () => ({ status: 200, body });
const sent = (route: string) => calls.filter((call) => call.route === route).map((call) => call.body);
const reviewRequired = (pending: unknown) => () => ({ status: 409, body: { message: "Antes de continuar, revisa el aviso de privacidad actualizado.", reason: "privacy_notice_review_required", pending } });

let token: string | null = "session-a";
let organizationId: string | null = "org-a";
const originalFetch = global.fetch;
beforeEach(() => {
  mockCanGoBack = false;
  routes = {};
  calls.length = 0;
  jest.clearAllMocks();
  token = "session-a";
  organizationId = "org-a";
  clearPrivacyReview();
  global.fetch = fetchMock as unknown as typeof fetch;
  configureApiClient({ getToken: () => token, getOrganizationId: () => organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
  clearPrivacyReview();
});

describe("the server's block (409 privacy_notice_review_required)", () => {
  it("a pending general notice blocks every organization; a supplement only its own", async () => {
    on("GET /affiliates/me", reviewRequired({ privacy_notice: null, organization_notice: { ...A1, organization_id: "org-a" } }));
    await expect(apiRequest("/api/v1/affiliates/me")).rejects.toMatchObject({ reason: "privacy_notice_review_required" });
    expect(reviewBlocks(getPrivacyReview(), "org-a")).toBe(true);
    expect(reviewBlocks(getPrivacyReview(), "org-b")).toBe(false);

    on("GET /notifications", reviewRequired({ privacy_notice: G2, organization_notice: null }));
    await expect(apiRequest("/api/v1/notifications")).rejects.toBeInstanceOf(ApiError);
    expect(reviewBlocks(getPrivacyReview(), "org-b")).toBe(true);
    expect(reviewBlocks(getPrivacyReview(), null)).toBe(true);
  });

  it("an answer that arrives after the session changed never blocks the new one", async () => {
    on("GET /affiliates/me", async () => {
      token = "session-b";
      return reviewRequired({ privacy_notice: G2, organization_notice: null })();
    });
    await expect(apiRequest("/api/v1/affiliates/me")).rejects.toBeInstanceOf(ApiError);
    expect(getPrivacyReview()).toBeNull();
  });

  it("GET /me/privacy is the full picture: without enforcement nothing blocks, with it only what needs review", () => {
    syncPrivacyReview(status("review", [], false).data as never);
    expect(getPrivacyReview()).toBeNull();
    syncPrivacyReview(status("none", [
      { id: "org-a", name: "A", current: A1, action: "none" },
      { id: "org-b", name: "B", current: B2, action: "review" },
    ]).data as never);
    expect(reviewBlocks(getPrivacyReview(), "org-a")).toBe(false);
    expect(reviewBlocks(getPrivacyReview(), "org-b")).toBe(true);
  });

  it("the guard leads to the review screen, before choosing an organization, and leaves the allowed screens alone", () => {
    const base = { authStatus: "signedIn" as const, orgStatus: "ready" as const, hasActiveOrganization: false, organizationsCount: 2, privacyReviewBlocking: true };
    expect(resolveRedirect({ ...base, segments: ["(app)"] })).toBe("/privacy-review");
    expect(resolveRedirect({ ...base, segments: ["organization-picker"] })).toBe("/privacy-review");
    for (const segment of ["privacy-review", "privacy", "delete-account", "leave-organization", "sign-out-pending", "join", "staff-invite"]) {
      expect(resolveRedirect({ ...base, hasActiveOrganization: true, segments: [segment] })).toBeNull();
    }
    expect(resolveRedirect({ ...base, privacyReviewBlocking: false, segments: ["(app)"] })).toBe("/organization-picker");
  });

  it("an error screen for this refusal leads to the review, never to a retry that repeats it", async () => {
    const error = new ApiError("conflict", "x", 409, undefined, { reason: "privacy_notice_review_required" });
    const onRetry = jest.fn();
    const view = await render(<ErrorState error={error} onRetry={onRetry} />);
    expect(view.getByText(/Antes de continuar, revisa el aviso de privacidad actualizado/)).toBeTruthy();
    expect(view.queryByText("Reintentar")).toBeNull();
    await act(async () => fireEvent.press(view.getByText("Revisar aviso de privacidad")));
    expect(mockPush).toHaveBeenCalledWith("/privacy-review");
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("API #92 lookup during a pending review: «no pudimos confirmar», never a resend, and the review is raised", async () => {
    const item: PendingAssistedEnrollment = {
      sponsorUserId: "sponsor-a", organizationId: "org-a", createAttempted: true,
      input: { first_name: "Ana", last_name: "Ficticia", email: "ana@example.test", client_request_id: "request-a", consent_confirmed: true },
    };
    on("GET /affiliates/me/assisted-enrollments/by-request/request-a", reviewRequired({ privacy_notice: null, organization_notice: { ...A1, organization_id: "org-a" } }));
    const check = await checkServerBeforeDiscard(item);
    expect(check).toEqual({ kind: "unavailable" });
    expect(discardConfirmation(item, check)).toMatch(/^No pudimos confirmar si el registro de Ana Ficticia llegó a crearse/);
    expect(calls.map((call) => call.route)).toEqual(["GET /affiliates/me/assisted-enrollments/by-request/request-a"]);
    expect(reviewBlocks(getPrivacyReview(), "org-a")).toBe(true);
  });
});

describe("the review screen", () => {
  const user = { id: "user-a", first_name: "Carla", last_name: "Prueba" } as AuthContextValue["user"];
  function auth(current = user): AuthContextValue {
    return {
      status: "signedIn", user: current, error: null, signIn: jest.fn(), register: jest.fn(), registerFromReferral: jest.fn(),
      refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(),
    };
  }
  const orgA = { id: "org-a", name: "Organización A" } as OrganizationContextValue["organizations"][number];
  function organizations(active = orgA): OrganizationContextValue {
    return { status: "ready", organizations: [orgA], activeOrganization: active, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
  }
  let client: QueryClient;
  async function mount(authValue = auth(), orgValue = organizations()) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const tree = (a: AuthContextValue) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={a}>
          <OrganizationContext.Provider value={orgValue}><PrivacyReviewScreen /></OrganizationContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(tree(authValue));
    });
    return { view, rerender: async (a: AuthContextValue) => act(async () => view.rerender(tree(a))) };
  }
  afterEach(() => client?.clear());
  const press = async (view: Awaited<ReturnType<typeof render>>, text: string) => act(async () => fireEvent.press(view.getByText(text)));
  const tick = async (view: Awaited<ReturnType<typeof render>>) => act(async () => fireEvent.press(view.getByTestId("notice-confirmation")));

  it("required review: shows what changed; an unchecked box, not opening, gates «Registrar»; unblocks with «Continuar»", async () => {
    on("GET /me/privacy", ok(status("review", [{ id: "org-a", name: "Organización A", current: A1, action: "none" }])));
    on("GET /privacy/notice", ok({ data: document(G2) }));
    on("POST /me/privacy/acknowledgements", ok(status("none", [{ id: "org-a", name: "Organización A", current: A1, action: "none" }])));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText(/Antes de seguir usando la app/)).toBeTruthy());
    expect(view.getByText("Revisión requerida")).toBeTruthy();
    expect(view.getByText("Cambio FICTICIO de prueba-general.2.")).toBeTruthy();
    expect(view.getAllByText("Al día")).toHaveLength(1);
    expect(view.getByTestId("notice-confirmation").props.accessibilityState.checked).toBe(false);
    expect(view.getByText("Se puso a mi disposición la versión prueba-general.2 de este aviso.")).toBeTruthy();
    await press(view, "Registrar");
    expect(sent("POST /me/privacy/acknowledgements")).toEqual([]);

    // Never opened: the box describes what happened, the document text was not loaded.
    await tick(view);
    await press(view, "Registrar");
    expect(sent("GET /privacy/notice")).toEqual([]);
    expect(sent("POST /me/privacy/acknowledgements")).toEqual([{ privacy_notice: G2, client_request_id: expect.stringMatching(/^attempt-/) }]);
    expect(calls.find((call) => call.route === "POST /me/privacy/acknowledgements")?.headers["X-Organization-ID"]).toBeUndefined();
    await waitFor(() => expect(getPrivacyReview()).toBeNull());
    await press(view, "Continuar");
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("informative change: never blocks; «Entendido» records it once", async () => {
    on("GET /me/privacy", ok(status("inform")));
    on("GET /privacy/notice", ok({ data: document(G1) }));
    on("POST /me/privacy/acknowledgements", ok(status("none")));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText("Actualización informativa")).toBeTruthy());
    expect(getPrivacyReview()).toBeNull();
    expect(view.queryByText(/Antes de seguir usando la app/)).toBeNull();
    await tick(view);
    await act(async () => {
      fireEvent.press(view.getByText("Entendido"));
      fireEvent.press(view.getByText("Entendido"));
    });
    expect(sent("POST /me/privacy/acknowledgements")).toHaveLength(1);
    await waitFor(() => expect(view.getByText("Al día")).toBeTruthy());
    expect(view.queryByText("Continuar")).toBeNull();
  });

  it("the version changed while reading (409 outdated): nothing is recorded for the old text, the new one is shown", async () => {
    on("GET /me/privacy", ok(status("review")));
    on("GET /privacy/notice", ok({ data: document(G2) }));
    on("POST /me/privacy/acknowledgements", () => ({ status: 409, body: { message: "El aviso de privacidad cambió.", reason: "privacy_notice_outdated", current: { privacy_notice: G1, organization_notice: null } } }));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText("Registrar")).toBeTruthy());
    await tick(view);
    await press(view, "Registrar");
    expect(view.getByText("El aviso cambió mientras lo leías. Te mostramos la versión nueva.")).toBeTruthy();
    expect(getPrivacyReview()).not.toBeNull();
    // The statuses are read again, so the card offers (and confirms) the server's current version.
    await waitFor(() => expect(sent("GET /me/privacy")).toHaveLength(2));
  });

  it("several organizations: only the active one's supplement blocks; each is recorded with its own organization", async () => {
    on("GET /me/privacy", ok(status("none", [
      { id: "org-a", name: "Organización A", current: A1, action: "none" },
      { id: "org-b", name: "Organización B", current: B2, action: "review" },
    ])));
    on("GET /me/privacy/organizations/org-b/notice", ok({ data: { ...document(B2), scope: "organization:org-b" } }));
    on("POST /me/privacy/acknowledgements", ok(status("none", [
      { id: "org-a", name: "Organización A", current: A1, action: "none" },
      { id: "org-b", name: "Organización B", current: B2, action: "none" },
    ])));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText("Aviso de Organización B")).toBeTruthy());
    expect(reviewBlocks(getPrivacyReview(), "org-a")).toBe(false);
    expect(reviewBlocks(getPrivacyReview(), "org-b")).toBe(true);
    expect(view.getByText("Salir de Organización B")).toBeTruthy();
    await tick(view);
    await press(view, "Registrar");
    expect(sent("POST /me/privacy/acknowledgements")).toEqual([{ organization_id: "org-b", organization_notice: B2, client_request_id: expect.any(String) }]);
    await waitFor(() => expect(getPrivacyReview()).toBeNull());
  });

  it("consents per purpose: separate, nothing preselected, a changed text needs a new decision", async () => {
    const purpose = { key: "finalidad_ficticia", title: "Finalidad ficticia", text: "Texto FICTICIO de la finalidad.", text_sha256: sha("e"), required_for: ["funcion.ficticia"] };
    const withDecision = (decision: string | null, textSha: string) => ({
      data: { ...status("none").data, privacy_notice: entry(G1, "none", { purposes: [{ key: purpose.key, title: purpose.title, text_sha256: textSha, required_for: purpose.required_for, decision, decided_at: decision ? "2026-10-27T00:00:00Z" : null }] }) },
    });
    on("GET /me/privacy", ok(withDecision("granted", sha("f"))));
    on("GET /privacy/notice", ok({ data: document(G1, [purpose]) }));
    on("POST /me/privacy/consents", ok(withDecision("refused", sha("e"))));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText("Lee el aviso para decidir sobre sus finalidades.")).toBeTruthy());
    await press(view, "Ver aviso");
    await waitFor(() => expect(view.getByTestId("purpose-finalidad_ficticia")).toBeTruthy());
    expect(view.getByText("El texto de esta finalidad cambió: tu decisión anterior ya no aplica.")).toBeTruthy();
    expect(view.getByText("Sí, acepto")).toBeTruthy();
    expect(view.getByText("No acepto")).toBeTruthy();
    await press(view, "No acepto");
    expect(sent("POST /me/privacy/consents")).toEqual([
      { document: G1, purpose: "finalidad_ficticia", decision: "refused", client_request_id: expect.any(String) },
    ]);
    await waitFor(() => expect(view.getByText("No aceptaste esta finalidad.")).toBeTruthy());
  });

  it("an answer that arrives after the account changed is dropped", async () => {
    let release!: () => void;
    on("GET /me/privacy", ok(status("review")));
    on("GET /privacy/notice", ok({ data: document(G2) }));
    on("POST /me/privacy/acknowledgements", () => new Promise<Answer>((resolve) => { release = () => resolve({ status: 200, body: status("none") }); }));
    const { view, rerender } = await mount();
    await waitFor(() => expect(view.getByText("Registrar")).toBeTruthy());
    await tick(view);
    await press(view, "Registrar");
    await rerender(auth({ ...user!, id: "user-b" }));
    await act(async () => release());
    // Still blocked: the late "none" of user-a did not clear it.
    expect(getPrivacyReview()).toEqual({ general: true, organizationIds: [] });
    expect(client.getQueryData(["me-privacy", "user-a"])).toEqual(status("review").data);
  });

  it("signing out and requesting deletion stay available while blocked", async () => {
    on("GET /me/privacy", ok(status("review")));
    const { view } = await mount();
    await waitFor(() => expect(view.getByText("Cerrar sesión")).toBeTruthy());
    await press(view, "Cerrar sesión");
    expect(mockSignOut).toHaveBeenCalled();
    await press(view, "Solicitar eliminación de mi cuenta");
    expect(mockPush).toHaveBeenCalledWith("/delete-account");
    await press(view, "Leer aviso completo");
    expect(mockPush).toHaveBeenCalledWith("/privacy");
  });
});

describe("the review screen always has a way out unless the server blocks", () => {
  // Physical round P2 (2026-10-28): opened for an informative change, the screen only offered «Cerrar sesión».
  const user = { id: "user-a", first_name: "Carla", last_name: "Prueba" } as AuthContextValue["user"];
  const auth: AuthContextValue = {
    status: "signedIn", user, error: null, signIn: jest.fn(), register: jest.fn(), registerFromReferral: jest.fn(),
    refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(),
  };
  const orgA = { id: "org-a", name: "Organización A" } as OrganizationContextValue["organizations"][number];
  const orgB = { id: "org-b", name: "Organización B" } as OrganizationContextValue["organizations"][number];
  let client: QueryClient;
  async function mount(active = orgA) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const organizations: OrganizationContextValue = { status: "ready", organizations: [orgA, orgB], activeOrganization: active, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(
        <QueryClientProvider client={client}>
          <AuthContext.Provider value={auth}>
            <OrganizationContext.Provider value={organizations}><PrivacyReviewScreen /></OrganizationContext.Provider>
          </AuthContext.Provider>
        </QueryClientProvider>,
      );
    });
    return view;
  }
  afterEach(() => client?.clear());

  it("opened from the banner for an informative change: «Volver» returns to Home, nothing blocks", async () => {
    mockCanGoBack = true;
    on("GET /me/privacy", ok(status("inform", [{ id: "org-a", name: "Organización A", current: A1, action: "none" }])));
    const view = await mount();
    await waitFor(() => expect(view.getByText("Actualización informativa")).toBeTruthy());
    expect(view.queryByTestId("privacy-blocking-documents")).toBeNull();
    expect(view.queryByText("Continuar")).toBeNull();
    await act(async () => fireEvent.press(view.getByText("Volver")));
    expect(mockBack).toHaveBeenCalled();
  });

  it("opened from Profile with everything up to date: «Volver», and Home when there is no screen behind", async () => {
    on("GET /me/privacy", ok(status("none", [{ id: "org-a", name: "Organización A", current: A1, action: "none" }])));
    const view = await mount();
    await waitFor(() => expect(view.getAllByText("Al día")).toHaveLength(2));
    await act(async () => fireEvent.press(view.getByText("Volver")));
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("a pending review elsewhere does not lock the active organization: «Volver» stays", async () => {
    on("GET /me/privacy", ok(status("none", [
      { id: "org-a", name: "Organización A", current: A1, action: "none" },
      { id: "org-b", name: "Organización B", current: B2, action: "review" },
    ])));
    const view = await mount(orgA);
    await waitFor(() => expect(view.getByText("Revisión requerida")).toBeTruthy());
    expect(view.getByText("Volver")).toBeTruthy();
  });

  it("required review with server blocking: names exactly the blocking document, no «Volver», and the allowed exits", async () => {
    on("GET /me/privacy", ok(status("review", [{ id: "org-a", name: "Organización A", current: A1, action: "inform" }])));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("privacy-blocking-documents")).toBeTruthy());
    // Only the general notice blocks; organization A's informative change is not listed.
    expect(view.getByText("Falta registrar: Aviso de privacidad general.")).toBeTruthy();
    expect(view.queryByText("Volver")).toBeNull();
    expect(view.getByText("Cerrar sesión")).toBeTruthy();
    expect(view.getByText("Solicitar eliminación de mi cuenta")).toBeTruthy();
    expect(view.getByText("Leer aviso completo")).toBeTruthy();
  });
});
