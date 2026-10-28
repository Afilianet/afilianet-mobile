import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import RegisterScreen from "../../app/(auth)/register";
import JoinScreen from "../../app/join/[organizationId]/[code]";
import StaffInviteScreen from "../../app/staff-invite/[token]";

/**
 * API #91 privacy notices in the steps that create an account or join an
 * organization, against simulated HTTP (the real client; only global fetch is
 * replaced). Documents are fictitious; refs always come from what was shown.
 */
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 200 } }));
jest.mock("../../auth/pendingReferral", () => ({
  usePendingReferral: () => null,
  savePendingReferral: jest.fn(() => Promise.resolve()),
  clearPendingReferral: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../features/surveys/signOut", () => ({ useSafeSignOut: () => jest.fn() }));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));

const sha = (char: string) => char.repeat(64);
function notice(version: string, hash: string, scope = "global") {
  return {
    scope, version, controller_name: "Responsable ficticio", controller_address: "Domicilio ficticio", contact_email: "privacidad@example.test",
    deletion_response_days: 20, deletion_response_days_kind: "hábiles",
    sections: [{ title: `Texto de ${version}`, text: "Documento FICTICIO de prueba." }],
    content_sha256: hash, classification: { change_class: "initial" }, summary_of_changes: null, purposes: [],
  };
}
const G1 = notice("prueba-general.1", sha("a"));
const G2 = notice("prueba-general.2", sha("b"));
const O1 = notice("prueba-suplemento-org-1.1", sha("c"), "organization:org-1");
const ref = (document: { version: string; content_sha256: string }) => ({ version: document.version, sha256: document.content_sha256 });

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

const originalFetch = global.fetch;
beforeEach(() => {
  routes = {};
  calls.length = 0;
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  configureApiClient({ getToken: () => "session-a", getOrganizationId: () => null });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "signedOut", user: null, error: null, signIn: jest.fn(), register: jest.fn(async () => undefined),
    registerFromReferral: jest.fn(async () => undefined), refreshUser: jest.fn(), onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(), signOut: jest.fn(), ...overrides,
  };
}
const organizations: OrganizationContextValue = {
  status: "ready", organizations: [], activeOrganization: null, error: null, selectOrganization: jest.fn(), refresh: jest.fn(async () => undefined),
};
const member = { id: "user-a", first_name: "Carla", last_name: "Ruiz", email: "carla@example.test" } as AuthContextValue["user"];

async function mount(element: React.ReactElement, auth: AuthContextValue) {
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = await render(
      <AuthContext.Provider value={auth}>
        <OrganizationContext.Provider value={organizations}>{element}</OrganizationContext.Provider>
      </AuthContext.Provider>,
    );
  });
  return view;
}
const press = async (view: Awaited<ReturnType<typeof render>>, text: string | RegExp) => {
  await act(async () => {
    fireEvent.press(view.getByText(text));
  });
};
/** The one confirmation box of a step: never preselected. */
const box = (view: Awaited<ReturnType<typeof render>>) => view.getByTestId("notice-confirmation");
const checked = (view: Awaited<ReturnType<typeof render>>) => Boolean(box(view).props.accessibilityState?.checked);
const tick = async (view: Awaited<ReturnType<typeof render>>) => act(async () => { fireEvent.press(box(view)); });
async function fillRegister(view: Awaited<ReturnType<typeof render>>, name = "Ana") {
  await act(async () => {
    fireEvent.changeText(view.getByLabelText("Nombre"), name);
    fireEvent.changeText(view.getByLabelText("Apellidos"), "Prueba");
    fireEvent.changeText(view.getByLabelText("Correo electrónico"), "ana@example.test");
    fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
    fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
  });
}

describe("Sign-up without an organization", () => {
  it("staging today (notice not published, 503): nothing is shown and the body is exactly as before", async () => {
    on("GET /privacy/notice", () => ({ status: 503, body: { message: "El aviso de privacidad no está disponible por el momento." } }));
    const auth = authValue();
    const view = await mount(<RegisterScreen />, auth);
    await fillRegister(view);
    await press(view, "Crear cuenta");
    expect(view.queryByTestId("step-notices")).toBeNull();
    expect(auth.register).toHaveBeenCalledWith({
      first_name: "Ana", last_name: "Prueba", email: "ana@example.test", password: "clave-ficticia-1", password_confirmation: "clave-ficticia-1",
    });
  });

  it("published: an explicit, unchecked box is required, opening is not; the ref travels with one id, reused on retry and renewed when the input changes", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    const register = jest.fn()
      .mockRejectedValueOnce(new ApiError("timeout", "The request timed out."))
      .mockResolvedValue(undefined);
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    await fillRegister(view);

    expect(checked(view)).toBe(false);
    expect(view.getByText("Se puso a mi disposición el Aviso de privacidad de Afilianet (versión prueba-general.1) antes de continuar.")).toBeTruthy();
    expect(view.getByText("Marcar esta casilla no es un consentimiento ni la aceptación de términos.")).toBeTruthy();
    await press(view, "Crear cuenta");
    expect(register).not.toHaveBeenCalled();
    expect(view.getByText("Marca la casilla para continuar.")).toBeTruthy();

    // Never opened: the box alone is enough, and nothing claims it was read.
    await tick(view);
    expect(checked(view)).toBe(true);
    expect(view.queryByText("Texto de prueba-general.1")).toBeNull();
    await press(view, "Crear cuenta");
    await press(view, "Crear cuenta");
    expect(register).toHaveBeenCalledTimes(2);
    const [first, retry] = register.mock.calls.map(([body]) => body);
    expect(first.privacy_notice).toEqual(ref(G1));
    expect(first).not.toHaveProperty("organization_notice");
    expect(first.client_request_id).toMatch(/^attempt-/);
    expect(retry.client_request_id).toBe(first.client_request_id);

    await fillRegister(view, "Anabel");
    await press(view, "Crear cuenta");
    expect(register.mock.calls[2][0].client_request_id).not.toBe(first.client_request_id);
  });

  it("required but unpublished (503 privacy_notice_unavailable): says so and keeps what was typed", async () => {
    on("GET /privacy/notice", () => ({ status: 503, body: { message: "No disponible." } }));
    const register = jest.fn().mockRejectedValue(new ApiError("server", "x", 503, undefined, { reason: "privacy_notice_unavailable" }));
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await fillRegister(view);
    await press(view, "Crear cuenta");
    expect(view.getByText(/El aviso de privacidad no está disponible por el momento, así que no es posible continuar/)).toBeTruthy();
    expect(view.getByLabelText("Nombre").props.value).toBe("Ana");
  });

  it("the notice changed while filling in the form (409 outdated): the box clears for the new version; same attempt", async () => {
    on("GET /privacy/notice", ok({ data: G1 }), ok({ data: G2 }));
    const register = jest.fn()
      .mockRejectedValueOnce(new ApiError("conflict", "x", 409, undefined, { reason: "privacy_notice_outdated", privacy: { current: { privacy_notice: ref(G2) } } }))
      .mockResolvedValue(undefined);
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    await fillRegister(view);
    await press(view, "Ver aviso");
    expect(view.getByText("Texto de prueba-general.1")).toBeTruthy();
    await tick(view);
    await press(view, "Crear cuenta");
    expect(view.getByText(/El aviso de privacidad cambió/)).toBeTruthy();
    expect(view.getByLabelText("Nombre").props.value).toBe("Ana");

    await waitFor(() => expect(view.getByText(/versión prueba-general.2/)).toBeTruthy());
    expect(checked(view)).toBe(false);
    await press(view, "Crear cuenta");
    expect(register).toHaveBeenCalledTimes(1);
    await tick(view);
    await press(view, "Crear cuenta");
    const [first, second] = register.mock.calls.map(([body]) => body);
    expect(second.privacy_notice).toEqual(ref(G2));
    expect(first.client_request_id).toMatch(/^attempt-/);
    expect(second.client_request_id).toBe(first.client_request_id);
  });
});

describe("Joining by referral link", () => {
  const LOOKUP = "GET /organizations/org-1/referrals/AFF100";
  const block = (organization_notice: unknown, required = true) => ({
    data: { id: "aff-1", affiliate_code: "AFF100", referrer_first_name: "Patricia", privacy: { required, privacy_notice: ref(G1), organization_notice } },
  });
  beforeEach(() => {
    mockParams = { organizationId: "org-1", code: "AFF100" };
    on("GET /privacy/notice", ok({ data: G1 }));
    on("POST /organizations/org-1/referrals/AFF100/invitations", ok({ data: { token: "tok-1" } }));
  });

  async function fillVisitor(view: Awaited<ReturnType<typeof render>>) {
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nombre"), "Bea");
      fireEvent.changeText(view.getByLabelText("Apellido"), "Prueba");
      fireEvent.changeText(view.getByLabelText("Correo electrónico"), "bea@example.test");
      fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
      fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
    });
  }

  it("a visitor confirms both documents with one box; both refs and the attempt id are sent, the invitation itself stays {}", async () => {
    on(LOOKUP, ok(block(O1)));
    const auth = authValue();
    const view = await mount(<JoinScreen />, auth);
    await waitFor(() => expect(view.getAllByText("Ver aviso")).toHaveLength(2));
    await fillVisitor(view);
    expect(view.getByText("Se pusieron a mi disposición el Aviso de privacidad de Afilianet (versión prueba-general.1) y el aviso de privacidad de la organización (versión prueba-suplemento-org-1.1) antes de continuar.")).toBeTruthy();
    await tick(view);
    await press(view, "Crear cuenta");
    expect(sent("POST /organizations/org-1/referrals/AFF100/invitations")).toEqual([{}]);
    const [, body] = (auth.registerFromReferral as jest.Mock).mock.calls[0];
    expect(body).toMatchObject({ privacy_notice: ref(G1), organization_notice: ref(O1), client_request_id: expect.any(String) });
  });

  it("an organization without its supplement: specific copy, nothing is sent, the form keeps what was typed", async () => {
    on(LOOKUP, ok(block(null)));
    const auth = authValue();
    const view = await mount(<JoinScreen />, auth);
    await waitFor(() => expect(view.getByTestId("step-notices-blocked")).toBeTruthy());
    expect(view.getByText(/Esta organización todavía no publica su aviso de privacidad/)).toBeTruthy();
    await fillVisitor(view);
    await press(view, "Crear cuenta");
    expect(auth.registerFromReferral).not.toHaveBeenCalled();
    expect(sent("POST /organizations/org-1/referrals/AFF100/invitations")).toEqual([]);
    expect(view.getByLabelText("Nombre").props.value).toBe("Bea");
  });

  describe("with a session", () => {
    const ACCEPT = "POST /invitations/tok-1/accept";
    const myPrivacy = (general: "none" | "inform" | "review") => ok({
      data: {
        required: true, enforce_review: false,
        privacy_notice: { current: ref(G1), change_class: "initial", summary_of_changes: null, action_required: general, acknowledged_current: general === "none", last_acknowledged: null, purposes: [] },
        organizations: [],
      },
    });
    const signedIn = () => authValue({ status: "signedIn", user: member });

    it("general notice pending: it is shown and sent with the supplement", async () => {
      on(LOOKUP, ok(block(O1)));
      on("GET /me/privacy", myPrivacy("review"));
      on(ACCEPT, ok({ data: { organization_role: "affiliate" } }));
      const view = await mount(<JoinScreen />, signedIn());
      await waitFor(() => expect(view.getAllByText("Ver aviso")).toHaveLength(2));
      await tick(view);
      await press(view, "Unirme con mi cuenta");
      expect(sent(ACCEPT)[0]).toEqual({ privacy_notice: ref(G1), organization_notice: ref(O1), client_request_id: expect.any(String) });
    });

    it("general notice up to date: only the supplement", async () => {
      on(LOOKUP, ok(block(O1)));
      on("GET /me/privacy", myPrivacy("none"));
      on(ACCEPT, ok({ data: { organization_role: "affiliate" } }));
      const view = await mount(<JoinScreen />, signedIn());
      await waitFor(() => expect(view.getAllByText("Ver aviso")).toHaveLength(1));
      expect(view.queryByText("Aviso de privacidad general")).toBeNull();
      await tick(view);
      await press(view, "Unirme con mi cuenta");
      expect(sent(ACCEPT)[0]).toEqual({ organization_notice: ref(O1), client_request_id: expect.any(String) });
    });

    it("the server still asks for the general notice (422, example 17d): it is shown and the same attempt is resent", async () => {
      on(LOOKUP, ok(block(O1)));
      on("GET /me/privacy", myPrivacy("none"));
      on(
        ACCEPT,
        () => ({ status: 422, body: { message: "El campo privacy notice es obligatorio.", errors: { privacy_notice: ["El campo privacy notice es obligatorio."] } } }),
        ok({ data: { organization_role: "affiliate" } }),
      );
      const view = await mount(<JoinScreen />, signedIn());
      await waitFor(() => expect(view.getAllByText("Ver aviso")).toHaveLength(1));
      await tick(view);
      await press(view, "Unirme con mi cuenta");
      expect(view.getByText("Para unirte, primero lee el aviso de privacidad general vigente.")).toBeTruthy();
      await waitFor(() => expect(view.getByText("Aviso de privacidad general")).toBeTruthy());
      // A new document joined the list: the earlier confirmation does not cover it.
      expect(checked(view)).toBe(false);
      await press(view, "Unirme con mi cuenta");
      expect(sent(ACCEPT)).toHaveLength(1);
      await tick(view);
      await press(view, "Unirme con mi cuenta");
      const [first, second] = sent(ACCEPT) as { client_request_id: string }[];
      expect(first.client_request_id).toMatch(/^attempt-/);
      expect(second).toEqual({ privacy_notice: ref(G1), organization_notice: ref(O1), client_request_id: first.client_request_id });
    });

    it("an older API (no /me/privacy, 404) with a required step: the general notice is shown anyway", async () => {
      on(LOOKUP, ok(block(O1)));
      on("GET /me/privacy", () => ({ status: 404, body: { message: "Not Found" } }));
      const view = await mount(<JoinScreen />, signedIn());
      await waitFor(() => expect(view.getAllByText("Ver aviso")).toHaveLength(2));
      expect(view.getByText("Aviso de privacidad general")).toBeTruthy();
    });
  });
});

describe("Staff invitation with a session", () => {
  const LOOKUP = "GET /staff-invitations/staff-tok";
  const ACCEPT = "POST /staff-invitations/staff-tok/accept";
  beforeEach(() => {
    mockParams = { token: "staff-tok" };
    on("GET /privacy/notice", ok({ data: G1 }));
    on("GET /me/privacy", ok({
      data: {
        required: true, enforce_review: false,
        privacy_notice: { current: ref(G1), change_class: "initial", summary_of_changes: null, action_required: "none", acknowledged_current: true, last_acknowledged: null, purposes: [] },
        organizations: [],
      },
    }));
  });

  it("the supplement changed meanwhile (409 outdated): the invitation is read again and the new version must be confirmed again", async () => {
    const O2 = notice("prueba-suplemento-org-1.2", sha("d"), "organization:org-1");
    const invitation = (organization_notice: unknown) => ok({
      data: { organization: { id: "org-1", name: "Organización ficticia" }, role: "manager", privacy: { required: true, privacy_notice: ref(G1), organization_notice } },
    });
    on(LOOKUP, invitation(O1), invitation(O2));
    on(
      ACCEPT,
      () => ({ status: 409, body: { message: "El aviso de privacidad cambió.", reason: "privacy_notice_outdated", current: { privacy_notice: ref(G1), organization_notice: ref(O2) } } }),
      ok({ data: { user: member, organization: { id: "org-1", name: "Organización ficticia" }, role: "manager", token: null } }),
    );
    const view = await mount(<StaffInviteScreen />, authValue({ status: "signedIn", user: member }));
    await waitFor(() => expect(view.getByText("Aviso de privacidad de Organización ficticia")).toBeTruthy());
    expect(view.getByText(/aviso de privacidad de Organización ficticia \(versión prueba-suplemento-org-1.1\)/)).toBeTruthy();
    await tick(view);
    await press(view, "Unirme a Organización ficticia");
    expect(view.getByText(/El aviso de privacidad cambió/)).toBeTruthy();
    await waitFor(() => expect(view.getByText(/versión prueba-suplemento-org-1.2/)).toBeTruthy());
    expect(checked(view)).toBe(false);
    await tick(view);
    await press(view, "Unirme a Organización ficticia");
    const [first, second] = sent(ACCEPT) as { organization_notice: unknown; client_request_id: string }[];
    expect(first.organization_notice).toEqual(ref(O1));
    expect(first.client_request_id).toMatch(/^attempt-/);
    expect(second).toEqual({ organization_notice: ref(O2), client_request_id: first.client_request_id });
  });
});
