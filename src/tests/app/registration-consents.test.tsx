import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { registerAccount } from "../../api/access";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { completeRegistrationReceipt } from "../../auth/registrationReceipt";
import { RegistrationReceiptCard } from "../../components/privacy/RegistrationReceiptCard";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import RegisterScreen from "../../app/(auth)/register";
import JoinScreen from "../../app/join/[organizationId]/[code]";
import { G1, G2, IDENTITY, QUALITY, recorded, ref } from "../support/registrationConsentsFixtures";

/**
 * Registration consents v1 (API draft contract, synthetic data): the purpose
 * boxes of the steps that create an account, against simulated HTTP.
 */
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
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
const ok = (body: unknown, status = 200) => () => ({ status, body });
const sent = (route: string) => calls.filter((call) => call.route === route).map((call) => call.body as Record<string, unknown>);
const REGISTER = "POST /auth/register";
// The app's own copy for a 422 on the consents (the API's message is not echoed).
const ACCESS_422 = "No pudimos registrar tus autorizaciones, así que tu cuenta no se creó. Tus datos siguen en el formulario; inténtalo de nuevo.";
const USER = { id: "user-new", first_name: "Ana", last_name: "Prueba", email: "ana@example.test" };

const originalFetch = global.fetch;
beforeEach(() => {
  routes = {};
  calls.length = 0;
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});
afterEach(() => {
  global.fetch = originalFetch;
});

/** The provider's own order: the real POST, then the receipt for the created account (AuthProvider.register). */
const realRegister = jest.fn(async (registration: Parameters<AuthContextValue["register"]>[0]) => {
  const result = await registerAccount(registration);
  completeRegistrationReceipt(result.user.id, result.privacy);
});

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "signedOut", user: null, error: null, signIn: jest.fn(), register: realRegister,
    registerFromReferral: jest.fn(async () => undefined), refreshUser: jest.fn(), onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(), signOut: jest.fn(), ...overrides,
  };
}
const organizations: OrganizationContextValue = {
  status: "ready", organizations: [], activeOrganization: null, error: null, selectOrganization: jest.fn(), refresh: jest.fn(async () => undefined),
};

type View = Awaited<ReturnType<typeof render>>;
async function mount(element: React.ReactElement, auth: AuthContextValue) {
  let view!: View;
  await act(async () => {
    view = await render(
      <AuthContext.Provider value={auth}>
        <OrganizationContext.Provider value={organizations}>{element}</OrganizationContext.Provider>
      </AuthContext.Provider>,
    );
  });
  return view;
}
const press = async (view: View, text: string | RegExp) => {
  await act(async () => {
    fireEvent.press(view.getByText(text));
  });
};
const pressId = async (view: View, testID: string) => {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
};
const isChecked = (view: View, testID: string) => Boolean(view.getByTestId(testID).props.accessibilityState?.checked);
const isDisabled = (view: View, testID: string) => Boolean(view.getByTestId(testID).props.accessibilityState?.disabled);
async function fillRegister(view: View, name = "Ana") {
  await act(async () => {
    fireEvent.changeText(view.getByLabelText("Nombre"), name);
    fireEvent.changeText(view.getByLabelText("Apellidos"), "Prueba");
    fireEvent.changeText(view.getByLabelText("Correo electrónico"), "ana@example.test");
    fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
    fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
  });
}
async function receipt() {
  return render(<RegistrationReceiptCard userId={USER.id} />);
}

describe("Direct sign-up", () => {
  it("every box starts unticked; the optional one says so; the full notice opens over the form before deciding; no identity box", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());

    expect(isChecked(view, "notice-confirmation")).toBe(false);
    expect(isChecked(view, "consent-box-quality_testing")).toBe(false);
    expect(view.queryByTestId("consent-identity_verification")).toBeNull();
    // The served title names the purpose; «Opcional» is shown once, never as a long note.
    expect(view.getByText(QUALITY.title)).toBeTruthy();
    expect(view.getAllByText(/opcional/i).length).toBeGreaterThan(0);
    expect(view.queryByText(/Si no la marcas/)).toBeNull();
    // The served texts, as they are: the box text is the purpose's own `text`.
    expect(view.getByText(QUALITY.text)).toBeTruthy();
    expect(view.getByTestId("simplified-notice")).toBeTruthy();
    expect(view.getByText("Resumen FICTICIO de prueba-general.2.")).toBeTruthy();

    // «Ver detalles» opens the full notice over the form before any box is ticked; closing it changes nothing.
    expect(view.queryByText("Texto de prueba-general.2")).toBeNull();
    await press(view, "Ver detalles");
    expect(view.getByText("Texto de prueba-general.2")).toBeTruthy();
    await press(view, "Cerrar");
    expect(view.queryByText("Texto de prueba-general.2")).toBeNull();
    expect(isChecked(view, "consent-box-quality_testing")).toBe(false);
    expect(isChecked(view, "notice-confirmation")).toBe(false);
  });

  it("opening and closing «Aviso de privacidad» or «Ver detalles» never ticks or clears a box and keeps everything typed", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    const typed = () => ["Nombre", "Apellidos", "Correo electrónico", "Contraseña", "Confirma tu contraseña"]
      .map((label) => view.getByLabelText(label).props.value);
    const before = typed();

    // Unticked: opening either link does not tick anything.
    await pressId(view, "notice-link-general");
    expect(view.getByTestId("notice-sheet")).toBeTruthy();
    await press(view, "Cerrar");
    await press(view, "Ver detalles");
    await press(view, "Cerrar");
    expect(isChecked(view, "notice-confirmation")).toBe(false);
    expect(isChecked(view, "consent-box-quality_testing")).toBe(false);
    expect(typed()).toEqual(before);

    // Ticked: opening and closing again does not clear them.
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await pressId(view, "notice-link-general");
    await press(view, "Cerrar");
    await press(view, "Ver detalles");
    await press(view, "Cerrar");
    expect(isChecked(view, "notice-confirmation")).toBe(true);
    expect(isChecked(view, "consent-box-quality_testing")).toBe(true);
    expect(typed()).toEqual(before);
    expect(view.queryByTestId("notice-sheet")).toBeNull();
  });

  it("refusing the optional box still creates the account; nothing is sent for it and no receipt claims anything", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    on(REGISTER, ok({ token: "tok", user: USER, privacy: recorded(G1, []) }, 201));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await press(view, "Crear cuenta");

    const [body] = sent(REGISTER);
    expect(body.privacy_notice).toEqual(ref(G1));
    expect(body).not.toHaveProperty("consents");
    expect(body).not.toHaveProperty("terms");
    expect((await receipt()).queryByTestId("registration-receipt")).toBeNull();
  });

  it("a ticked box is sent as granted on the notice shown, and shown as recorded only because the API returned it", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    on(REGISTER, ok({ token: "tok", user: USER, privacy: recorded(G1, [QUALITY]) }, 201));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");

    expect(sent(REGISTER)[0]).toMatchObject({
      privacy_notice: ref(G1),
      consents: [{ document: ref(G1), purpose: "quality_testing", decision: "granted" }],
      client_request_id: expect.stringMatching(/^attempt-/),
    });
    const card = await receipt();
    expect(card.getByText(`Registrada: ${QUALITY.title}`)).toBeTruthy();
    expect(card.queryByText(/No quedó registrada/)).toBeNull();
  });

  it.each([
    ["the API stored something else", { privacy: recorded(G1, [{ ...QUALITY, decision: "refused" as const }]) }],
    ["an API without the contract returns no privacy block", {}],
  ])("a sent decision the API did not return is never shown as recorded (%s)", async (_case, extra) => {
    on("GET /privacy/notice", ok({ data: G1 }));
    on(REGISTER, ok({ token: "tok", user: USER, ...extra }, 201));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");

    const card = await receipt();
    expect(card.queryByText(/^Registrada/)).toBeNull();
    expect(card.getByText(`No quedó registrada: ${QUALITY.title}. Puedes decidirlo después en Avisos de privacidad.`)).toBeTruthy();
    fireEvent.press(card.getByText("Ir a Avisos de privacidad"));
    expect(mockPush).toHaveBeenCalledWith("/privacy-review");
  });

  it("a failed save (422) creates nothing and claims nothing; the boxes and the form stay as they were", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    on(REGISTER, () => ({ status: 422, body: { message: "Los datos no son válidos.", errors: { "consents.0.purpose": ["The selected purpose is invalid."] } } }));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");

    expect(view.getByRole("alert").props.children).toBe(ACCESS_422);
    expect(isChecked(view, "consent-box-quality_testing")).toBe(true);
    expect(view.getByLabelText("Nombre").props.value).toBe("Ana");
    expect((await receipt()).queryByTestId("registration-receipt")).toBeNull();
  });

  it("an uncertain answer (timeout) is retried with the same id; changing a box is a new attempt", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    const register = jest.fn()
      .mockRejectedValueOnce(new ApiError("timeout", "The request timed out."))
      .mockRejectedValueOnce(new ApiError("timeout", "The request timed out."))
      .mockResolvedValue(undefined);
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");
    await press(view, "Crear cuenta");
    const [first, retry] = register.mock.calls.map(([body]) => body);
    expect(retry.client_request_id).toBe(first.client_request_id);

    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");
    const changed = register.mock.calls[2][0];
    expect(changed).not.toHaveProperty("consents");
    expect(changed.client_request_id).not.toBe(first.client_request_id);
  });

  it("the notice changed (409 outdated): the purpose boxes clear for the new text", async () => {
    on("GET /privacy/notice", ok({ data: G1 }), ok({ data: G2 }));
    const register = jest.fn()
      .mockRejectedValueOnce(new ApiError("conflict", "x", 409, undefined, { reason: "privacy_notice_outdated", privacy: { current: { privacy_notice: ref(G2) } } }))
      .mockResolvedValue(undefined);
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");

    await waitFor(() => expect(view.getByText("Texto FICTICIO nuevo de la casilla B.")).toBeTruthy());
    expect(isChecked(view, "consent-box-quality_testing")).toBe(false);
    await pressId(view, "notice-confirmation");
    await press(view, "Crear cuenta");
    expect(register.mock.calls[1][0]).not.toHaveProperty("consents");
    expect(register.mock.calls[1][0].privacy_notice).toEqual(ref(G2));
  });

  it("double tap: one request, and the boxes cannot change while it is in flight", async () => {
    on("GET /privacy/notice", ok({ data: G1 }));
    let finish!: () => void;
    const register = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = await mount(<RegisterScreen />, authValue({ register }));
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await act(async () => {
      fireEvent.press(view.getByText("Crear cuenta"));
      fireEvent.press(view.getByText("Crear cuenta"));
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(isDisabled(view, "consent-box-quality_testing")).toBe(true);
    expect(isDisabled(view, "notice-confirmation")).toBe(true);
    await pressId(view, "consent-box-quality_testing");
    expect(isChecked(view, "consent-box-quality_testing")).toBe(false);
    await act(async () => finish());
  });

  it("a notice without these purposes (today's staging): no box, nothing new in the body", async () => {
    on("GET /privacy/notice", ok({ data: { ...G1, purposes: [], simplified_notice: null } }));
    on(REGISTER, ok({ token: "tok", user: USER }, 201));
    const view = await mount(<RegisterScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    expect(view.queryByTestId("registration-consents")).toBeNull();
    expect(view.queryByTestId("simplified-notice")).toBeNull();
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await press(view, "Crear cuenta");
    expect(Object.keys(sent(REGISTER)[0]).sort()).toEqual(
      ["client_request_id", "email", "first_name", "last_name", "password", "password_confirmation", "privacy_notice"],
    );
  });
});

describe("Joining by referral link as a visitor", () => {
  const LOOKUP = "GET /organizations/org-1/referrals/AFF100";
  // No supplement in these fixtures, so `required` is false: only the general notice is shown.
  const lookup = (verification_expected?: boolean) => ok({
    data: {
      id: "aff-1", affiliate_code: "AFF100", referrer_first_name: "Patricia",
      privacy: { required: false, privacy_notice: ref(G1), organization_notice: null, ...(verification_expected === undefined ? {} : { verification_expected }) },
    },
  });
  beforeEach(() => {
    mockParams = { organizationId: "org-1", code: "AFF100" };
    on("GET /privacy/notice", ok({ data: G1 }));
    on("POST /organizations/org-1/referrals/AFF100/invitations", ok({ data: { token: "tok-1" } }));
  });
  async function fillVisitor(view: View) {
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nombre"), "Bea");
      fireEvent.changeText(view.getByLabelText("Apellido"), "Prueba");
      fireEvent.changeText(view.getByLabelText("Correo electrónico"), "bea@example.test");
      fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
      fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
    });
  }

  it("an organization that verifies identity: no identity box at sign-up (asked at verification start); quality stays optional", async () => {
    on(LOOKUP, lookup(true));
    const auth = authValue();
    const view = await mount(<JoinScreen />, auth);
    await waitFor(() => expect(view.getByTestId("consent-quality_testing")).toBeTruthy());
    expect(view.queryByTestId("consent-identity_verification")).toBeNull();
    expect(view.queryByText(IDENTITY.text)).toBeNull();

    await fillVisitor(view);
    await pressId(view, "notice-confirmation");
    await press(view, "Crear cuenta");
    const [, first] = (auth.registerFromReferral as jest.Mock).mock.calls[0];
    expect(first).not.toHaveProperty("consents");
  });

  it.each([[false], [undefined]])("verification_expected=%s: no identity box either", async (expected) => {
    on(LOOKUP, lookup(expected));
    const view = await mount(<JoinScreen />, authValue());
    await waitFor(() => expect(view.getByTestId("consent-quality_testing")).toBeTruthy());
    expect(view.queryByTestId("consent-identity_verification")).toBeNull();
  });
});
