import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { ApiError, friendlyMessage } from "../../api/errors";
import { fetchMyAffiliateProfile, fetchMyCompliance, startCompliance } from "../../api/endpoints";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import ComplianceScreen from "../../app/compliance";
import { G1, IDENTITY, myPrivacy, ref, sha } from "../support/registrationConsentsFixtures";

/**
 * Registration consents v1 at KYC start (synthetic data): an activated
 * account reuses its own effective authorization, or records it here. The
 * case endpoints are mocked; privacy goes through the real client.
 */
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }) }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 200 } }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));
jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(async () => []),
}));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));

type Handler = (body: unknown) => { status: number; body?: unknown } | Promise<never>;
let routes: Record<string, Handler[]> = {};
const calls: { route: string; body: unknown }[] = [];
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? "GET"} ${url.replace("https://api.test/api/v1", "")}`;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ route, body });
  const queue = routes[route];
  if (!queue?.length) throw new Error(`Unexpected request ${route}`);
  const handler = queue.length > 1 ? queue.shift()! : queue[0];
  const answer = await handler(body);
  return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
});
const on = (route: string, ...handlers: Handler[]) => { routes[route] = handlers; };
const ok = (body: unknown) => () => ({ status: 200, body });
const sent = (route: string) => calls.filter((call) => call.route === route).map((call) => call.body);
const CONSENTS = "POST /me/privacy/consents";
const ME_PRIVACY = "GET /me/privacy";

const ORG = {
  id: "org-a", name: "Acme", slug: "acme", legal_name: null, status: "active", timezone: "UTC", locale: "es", currency: "MXN",
  metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", my_role: "affiliate", my_membership_status: "active",
} as OrganizationContextValue["activeOrganization"];
const organization: OrganizationContextValue = {
  status: "ready", organizations: [ORG!], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};
const auth = {
  status: "signedIn", user: { id: "user-a", first_name: "Ana", last_name: "Prueba" }, error: null, signIn: jest.fn(), register: jest.fn(),
  registerFromReferral: jest.fn(), refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(),
} as unknown as AuthContextValue;

const originalFetch = global.fetch;
let queryClient: QueryClient;
beforeEach(() => {
  routes = {};
  calls.length = 0;
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  global.fetch = fetchMock as unknown as typeof fetch;
  configureApiClient({ getToken: () => "session-a", getOrganizationId: () => "org-a" });
  (fetchMyAffiliateProfile as jest.Mock).mockResolvedValue({ id: "aff-1", affiliate_code: "AFF100", status: "pending", joined_at: "2026-01-01", activated_at: null, metadata: null, created_at: "2026-01-01" });
  (fetchMyCompliance as jest.Mock).mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
  (startCompliance as jest.Mock).mockResolvedValue({ id: "case-1" });
  on("GET /privacy/notice", ok({ data: G1 }));
});
afterEach(() => {
  global.fetch = originalFetch;
  // No cache timers left behind: the process exits as soon as the suite ends.
  queryClient.clear();
});

type View = Awaited<ReturnType<typeof render>>;
async function mount(assistedId?: string) {
  let view!: View;
  await act(async () => {
    view = await render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <OrganizationContext.Provider value={organization}>
            <AssistedComplianceContext.Provider value={assistedId}>
              <ComplianceScreen />
            </AssistedComplianceContext.Provider>
          </OrganizationContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
  });
  return view;
}
const startButton = (view: View) => view.getByText("Comenzar verificación");
/** The pressable that holds the start label: its own accessibility state says whether it is disabled. */
const startDisabled = (view: View) => {
  let node: ReturnType<View["getByText"]> | null = startButton(view);
  while (node && node.props.accessibilityState?.disabled === undefined) node = node.parent;
  return Boolean(node?.props.accessibilityState?.disabled);
};
const press = async (view: View, text: string | RegExp) => {
  await act(async () => {
    fireEvent.press(view.getByText(text));
  });
};

describe("KYC start with an activated account", () => {
  it("an effective authorization (granted by the holder, current text) is reused: no box, verification can start", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "granted", decision: "granted", decided_at: "2026-11-04T10:00:00-06:00", effective: true, requirement: null })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
    expect(view.getByText(/Usaremos la autorización que registraste el/)).toBeTruthy();
    expect(view.queryByTestId("identity-consent-box")).toBeNull();
    expect(startDisabled(view)).toBe(false);
    await press(view, "Comenzar verificación");
    expect(startCompliance).toHaveBeenCalledTimes(1);
    expect(sent(CONSENTS)).toEqual([]);
  });

  it("missing: the notice's own text in an unticked box; nothing starts or is recorded until the person ticks and records it", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    on(CONSENTS, ok(myPrivacy({ status: "granted", decision: "granted", decided_at: "2026-11-04T10:00:00-06:00", effective: true, requirement: null })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    expect(view.getByText(IDENTITY.text)).toBeTruthy();
    expect(view.getByText(/Es distinta del permiso de la cámara/)).toBeTruthy();
    expect(view.getByTestId("identity-consent-box").props.accessibilityState.checked).toBe(false);
    expect(startDisabled(view)).toBe(true);
    await press(view, "Comenzar verificación");
    expect(startCompliance).not.toHaveBeenCalled();

    await press(view, "Registrar autorización");
    expect(view.getByText("Marca la casilla para registrar tu autorización.")).toBeTruthy();
    expect(sent(CONSENTS)).toEqual([]);

    await act(async () => fireEvent.press(view.getByTestId("identity-consent-box")));
    await press(view, "Registrar autorización");
    expect(sent(CONSENTS)).toEqual([{ document: ref(G1), purpose: "identity_verification", decision: "granted", client_request_id: expect.stringMatching(/^attempt-/) }]);
    await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
    expect(startDisabled(view)).toBe(false);
  });

  it("a failed save claims nothing and keeps verification closed; the retry reuses the same request id", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    on(CONSENTS, () => ({ status: 500, body: { message: "Server Error" } }), ok(myPrivacy({ status: "granted", decision: "granted", decided_at: "2026-11-04T10:00:00-06:00", effective: true, requirement: null })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    await act(async () => fireEvent.press(view.getByTestId("identity-consent-box")));
    await press(view, "Registrar autorización");
    expect(view.getByText("Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.")).toBeTruthy();
    expect(view.queryByTestId("identity-consent-effective")).toBeNull();
    expect(startDisabled(view)).toBe(true);

    await press(view, "Registrar autorización");
    const [first, retry] = sent(CONSENTS) as { client_request_id: string }[];
    expect(retry.client_request_id).toBe(first.client_request_id);
    await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
  });

  it("a 2xx whose state is still not effective is not shown as recorded", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    on(CONSENTS, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    await act(async () => fireEvent.press(view.getByTestId("identity-consent-box")));
    await press(view, "Registrar autorización");
    expect(view.getByText("Tu autorización no quedó registrada. Inténtalo de nuevo.")).toBeTruthy();
    expect(view.queryByTestId("identity-consent-effective")).toBeNull();
    expect(startDisabled(view)).toBe(true);
  });

  it("double tap on record: one request", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    let answer!: () => void;
    on(CONSENTS, () => new Promise((resolve) => {
      answer = () => resolve({ status: 200, body: myPrivacy({ status: "granted", decision: "granted", decided_at: "2026-11-04T10:00:00-06:00", effective: true, requirement: null }) });
    }) as never);
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    await act(async () => fireEvent.press(view.getByTestId("identity-consent-box")));
    await act(async () => {
      fireEvent.press(view.getByText("Registrar autorización"));
      fireEvent.press(view.getByText("Registrar autorización"));
    });
    expect(sent(CONSENTS)).toHaveLength(1);
    answer();
    await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
  });

  it.each([
    ["refused", "Registraste que no autorizas la verificación. Puedes cambiar tu decisión aquí."],
    ["outdated", "El texto de la autorización cambió desde tu última decisión. Revísalo de nuevo."],
  ])("%s: asked again with the current text, never reused", async (status, note) => {
    on(ME_PRIVACY, ok(myPrivacy({ status, decision: status === "refused" ? "refused" : "granted", effective: false, requirement: "grant" })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    expect(view.getByText(note)).toBeTruthy();
    expect(view.getByTestId("identity-consent-box").props.accessibilityState.checked).toBe(false);
    expect(startDisabled(view)).toBe(true);
  });

  it("holder_verification: asks to confirm email or phone first, with no box", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "granted", decision: "granted", effective: false, requirement: "holder_verification" })));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-holder-verification")).toBeTruthy());
    expect(view.queryByTestId("identity-consent-box")).toBeNull();
    expect(startDisabled(view)).toBe(true);
    await press(view, "Confirmar correo o celular");
    expect(mockPush).toHaveBeenCalledWith("/verify-account");
  });

  it("the served notice is not the version the decision is recorded against: no box, retry offered", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    on("GET /privacy/notice", ok({ data: { ...G1, content_sha256: sha("f") } }));
    const view = await mount();
    await waitFor(() => expect(view.getByText("No pudimos cargar el texto de la autorización. Inténtalo de nuevo.")).toBeTruthy());
    expect(view.queryByTestId("identity-consent-box")).toBeNull();
  });

  it("an open case (e.g. in progress before the gate was turned on) asks for it above the steps, never for a closed one", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    on(CONSENTS, ok(myPrivacy({ status: "granted", decision: "granted", decided_at: "2026-11-04T10:00:00-06:00", effective: true, requirement: null })));
    (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-1", status: "in_progress", current_step: "identity_document", steps: [] });
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("identity-consent-open-case")).toBeTruthy());
    await act(async () => fireEvent.press(view.getByTestId("identity-consent-box")));
    await press(view, "Registrar autorización");
    await waitFor(() => expect(view.queryByTestId("identity-consent-open-case")).toBeNull());
  });

  it("a closed case does not ask", async () => {
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-1", status: "approved", current_step: null, steps: [] });
    const view = await mount();
    await waitFor(() => expect(view.getByText("Aprobado")).toBeTruthy());
    expect(view.queryByTestId("identity-consent-open-case")).toBeNull();
  });

  it("a lost answer to start (the server created the case, so a retry would get 422): the case is read again and shown", async () => {
    on(ME_PRIVACY, ok(myPrivacy(null)));
    (startCompliance as jest.Mock).mockRejectedValueOnce(new ApiError("timeout", "The request timed out."));
    const view = await mount();
    await waitFor(() => expect(startDisabled(view)).toBe(false));
    // The first answer was lost, but the server created the case.
    (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-1", status: "in_progress", current_step: "identity_document", steps: [] });
    await press(view, "Comenzar verificación");
    await waitFor(() => expect(view.getByText("En progreso")).toBeTruthy());
    expect(view.queryByText("Comenzar verificación")).toBeNull();
  });

  it("no such purpose in the notice (gate off, today): nothing changes", async () => {
    on(ME_PRIVACY, ok(myPrivacy(null)));
    const view = await mount();
    await waitFor(() => expect(calls.some((call) => call.route === ME_PRIVACY)).toBe(true));
    await waitFor(() => expect(startButton(view)).toBeTruthy());
    expect(view.queryByText("Autorización para verificar tu identidad")).toBeNull();
    expect(startDisabled(view)).toBe(false);
    await press(view, "Comenzar verificación");
    expect(startCompliance).toHaveBeenCalledTimes(1);
  });

  it("the server still asks (403 consent_required at start): its message, and the state is read again", async () => {
    on(ME_PRIVACY, ok(myPrivacy(null)), ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    (startCompliance as jest.Mock).mockRejectedValue(
      new ApiError("forbidden", "Esta función requiere tu consentimiento específico.", 403, undefined, { reason: "consent_required", consent: { holder: "self", requirement: "grant" } }),
    );
    const view = await mount();
    await waitFor(() => expect(calls.filter((call) => call.route === ME_PRIVACY)).toHaveLength(1));
    await waitFor(() => expect(startDisabled(view)).toBe(false));
    await press(view, "Comenzar verificación");
    expect(view.getByText("Antes de continuar, autoriza la verificación de identidad.")).toBeTruthy();
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
  });
});

describe("Assisted enrollment (the sponsor's session)", () => {
  it("an assisted case never shows the sponsor's own authorization: the server checks the person and its 403 is explained", async () => {
    // The sponsor's own /me/privacy would ask for a grant; it must not be read nor shown for someone else's case.
    on(ME_PRIVACY, ok(myPrivacy({ status: "missing", effective: false, requirement: "grant" })));
    (startCompliance as jest.Mock).mockRejectedValue(
      new ApiError("forbidden", "x", 403, undefined, { reason: "consent_required", consent: { holder: "assisted_person", requirement: "grant" } }),
    );
    const view = await mount("enrollment-1");
    await waitFor(() => expect(startButton(view)).toBeTruthy());
    expect(view.queryByTestId("identity-consent-box")).toBeNull();
    expect(view.queryByText("Autorización para verificar tu identidad")).toBeNull();
    expect(calls.some((call) => call.route === ME_PRIVACY)).toBe(false);
    expect(startDisabled(view)).toBe(false);

    await press(view, "Comenzar verificación");
    expect(startCompliance).toHaveBeenCalledWith("enrollment-1");
    expect(view.getByText("La persona todavía no autoriza la verificación de identidad desde su propia cuenta. Solo ella puede hacerlo.")).toBeTruthy();
    expect(sent(CONSENTS)).toEqual([]);
  });

  it("the sponsor is told only the person can authorize; nothing is attributed to them", () => {
    const assisted = new ApiError("forbidden", "x", 403, undefined, { reason: "consent_required", consent: { holder: "assisted_person", requirement: "grant" } });
    const holderOnly = new ApiError("forbidden", "x", 403, undefined, { reason: "consent_holder_only" });
    expect(friendlyMessage(assisted)).toBe("La persona todavía no autoriza la verificación de identidad desde su propia cuenta. Solo ella puede hacerlo.");
    expect(friendlyMessage(holderOnly)).toBe("Solo la persona puede decidir sobre sus autorizaciones, desde su propia cuenta.");
  });

  it("the HTTP client keeps whose consent a 403 asks for", async () => {
    on("POST /affiliates/me/assisted-enrollments/enr-1/compliance/start", () => ({
      status: 403,
      body: { message: "Esta función requiere tu consentimiento específico.", reason: "consent_required", requirement: "grant", holder: "assisted_person", purpose: { key: "identity_verification" } },
    }));
    const { apiRequest } = jest.requireActual("../../api/client") as typeof import("../../api/client");
    const error = await apiRequest("/api/v1/affiliates/me/assisted-enrollments/enr-1/compliance/start", { method: "POST" }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ reason: "consent_required", consent: { holder: "assisted_person", requirement: "grant" } });
  });
});
