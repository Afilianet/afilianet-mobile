import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { registerAccount } from "../../api/access";
import { apiRequest, configureApiClient } from "../../api/client";
import { ApiError, friendlyMessage } from "../../api/errors";
import { acceptReferralInvitation, fetchMyAffiliateProfile, fetchMyCompliance, startCompliance } from "../../api/endpoints";
import { wasRecorded, type RecordedPrivacy } from "../../api/privacy";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { completeRegistrationReceipt } from "../../auth/registrationReceipt";
import { RegistrationReceiptCard } from "../../components/privacy/RegistrationReceiptCard";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import RegisterScreen from "../../app/(auth)/register";
import ComplianceScreen from "../../app/compliance";
import contract from "../support/api-contract/registration-consents-4bf8398.json";

/**
 * Registration consents v1 against the API's own synthetic examples
 * (Afilianet/afilianet-api#118 @ 4bf8398, docs/privacy/examples/consents),
 * served verbatim to the real HTTP client and screens.
 */
type Example = { request: { method: string; path: string; body?: Record<string, unknown> | null }; status: number; response: unknown };
const example = (name: string) => (contract.examples as Record<string, Example>)[name];
const NOTICE = example("02-aviso-con-finalidades-200");
const REGISTERED = example("04-registro-con-decisiones-201");
const REPLAY = example("05-registro-reintento-201");
const UNKNOWN_PURPOSE = example("06-finalidad-desconocida-422");
const KYC_WITHOUT = example("08-kyc-sin-consentimiento-403");
const MY_PRIVACY_MISSING = example("09-mi-privacidad-faltante-200");
const GRANTED = example("10-otorgar-con-sesion-200");
const SPONSOR_DECIDES = example("12-patrocinador-decide-por-otro-403");
const ASSISTED_WITHOUT = example("13-captura-asistida-sin-consentimiento-403");
const noticeData = (NOTICE.response as { data: { version: string; content_sha256: string; purposes: { key: string; title: string; text: string }[] } }).data;
const quality = noticeData.purposes.find((purpose) => purpose.key === "quality_testing")!;
const identity = noticeData.purposes.find((purpose) => purpose.key === "identity_verification")!;

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 200 } }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));
jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(async () => []),
  acceptReferralInvitation: jest.requireActual("../../api/endpoints").acceptReferralInvitation,
}));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));

const calls: { route: string; body: Record<string, unknown> | undefined }[] = [];
let served: Record<string, Example> = {};
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? "GET"} ${url.replace("https://api.test", "")}`;
  calls.push({ route, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const answer = served[route];
  if (!answer) throw new Error(`Unexpected request ${route}`);
  return new Response(JSON.stringify(answer.response), { status: answer.status, headers: { "Content-Type": "application/json" } });
});
const serve = (...examples: Example[]) => {
  for (const item of examples) served[`${item.request.method} ${item.request.path.replace(/ \(.*\)$/, "")}`] = item;
};
const sent = (route: string) => calls.filter((call) => call.route === route).map((call) => call.body!);

const originalFetch = global.fetch;
let queryClient: QueryClient;
beforeEach(() => {
  served = {};
  calls.length = 0;
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  global.fetch = fetchMock as unknown as typeof fetch;
  configureApiClient({ getToken: () => "session-a", getOrganizationId: () => null });
});
afterEach(() => {
  global.fetch = originalFetch;
  queryClient.clear();
});

const realRegister = jest.fn(async (registration: Parameters<AuthContextValue["register"]>[0]) => {
  const result = await registerAccount(registration);
  completeRegistrationReceipt(result.user.id, result.privacy);
});
const auth = (overrides: Partial<AuthContextValue> = {}) => ({
  status: "signedOut", user: null, error: null, signIn: jest.fn(), register: realRegister, registerFromReferral: jest.fn(),
  refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(), ...overrides,
}) as AuthContextValue;
const ORG = { id: "org-a", name: "Acme", my_role: "affiliate", my_membership_status: "active" } as OrganizationContextValue["activeOrganization"];
const organization: OrganizationContextValue = {
  status: "ready", organizations: [ORG!], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};

type View = Awaited<ReturnType<typeof render>>;
async function mount(element: React.ReactElement, value: AuthContextValue) {
  let view!: View;
  await act(async () => {
    view = await render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={value}>
          <OrganizationContext.Provider value={organization}>{element}</OrganizationContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
  });
  return view;
}
const press = async (view: View, text: string) => act(async () => { fireEvent.press(view.getByText(text)); });
const pressId = async (view: View, testID: string) => act(async () => { fireEvent.press(view.getByTestId(testID)); });
async function fillRegister(view: View) {
  await act(async () => {
    fireEvent.changeText(view.getByLabelText("Nombre"), "Ana");
    fireEvent.changeText(view.getByLabelText("Apellidos"), "Sintética");
    fireEvent.changeText(view.getByLabelText("Correo electrónico"), "ana.sintetica@example.test");
    fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
    fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
  });
}

describe("Sign-up against API #118's examples", () => {
  it("02 → 04: the served purpose texts; the body has the example's shape; recorded only what the 201 returned", async () => {
    serve(NOTICE, REGISTERED);
    const view = await mount(<RegisterScreen />, auth());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    expect(view.getByText(quality.text)).toBeTruthy();
    expect(view.getByText("Resumen sintético.")).toBeTruthy();
    // Direct sign-up has no organization: identity verification is asked at KYC start.
    expect(view.queryByText(identity.text)).toBeNull();

    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");

    const [body] = sent("POST /api/v1/auth/register");
    const exampleBody = REGISTERED.request.body!;
    // Every field sent is one the example sends, with the same shapes (no `terms` while /legal/terms is not used).
    for (const key of Object.keys(body)) expect(Object.keys(exampleBody)).toContain(key);
    expect(body.privacy_notice).toEqual(exampleBody.privacy_notice);
    expect(body.consents).toEqual((exampleBody.consents as { purpose: string }[]).filter((consent) => consent.purpose === "quality_testing"));
    expect(body).not.toHaveProperty("terms");

    const card = await render(<RegistrationReceiptCard userId={(REGISTERED.response as { user: { id: string } }).user.id} />);
    expect(card.getByText(`Registrada: ${quality.title}`)).toBeTruthy();
  });

  it("05: the replay returns the same stored privacy, so the same decisions read as recorded", () => {
    const first = (REGISTERED.response as { privacy: RecordedPrivacy }).privacy;
    const replay = (REPLAY.response as { privacy: RecordedPrivacy }).privacy;
    expect(replay).toEqual(first);
    for (const consent of REGISTERED.request.body!.consents as Parameters<typeof wasRecorded>[1][]) {
      expect(wasRecorded(replay, consent)).toBe(true);
    }
  });

  it("06: a 422 on a purpose creates nothing and shows the app's own copy", async () => {
    serve(NOTICE, UNKNOWN_PURPOSE);
    const view = await mount(<RegisterScreen />, auth());
    await waitFor(() => expect(view.getByTestId("registration-consents")).toBeTruthy());
    await fillRegister(view);
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Crear cuenta");
    expect(view.getByText("No pudimos registrar tus autorizaciones, así que tu cuenta no se creó. Tus datos siguen en el formulario; inténtalo de nuevo.")).toBeTruthy();
    expect((await render(<RegistrationReceiptCard userId="dcb52638-27b9-41ae-adbc-a489f04fb5bb" />)).queryByTestId("registration-receipt")).toBeNull();
  });

  it("joining by link (POST /invitations/{token}/accept): the API wraps the answer in `data`; the stored privacy is read from there", async () => {
    // API #119: PublicInvitationController::accepted answers {data: {user, token, privacy, ...}} with the same
    // StepDecisions summary as registration; the body and privacy here are example 04's.
    const response = REGISTERED.response as { token: string; user: { id: string }; privacy: RecordedPrivacy };
    served["POST /api/v1/invitations/tok-1/accept"] = {
      request: { method: "POST", path: "/api/v1/invitations/tok-1/accept" },
      status: 200,
      response: { data: { user: response.user, organization_role: "affiliate", affiliate: { id: "aff-x", affiliate_code: "AFF200", status: "pending" }, token: response.token, already_affiliated: false, privacy: response.privacy } },
    };
    const consents = REGISTERED.request.body!.consents as Parameters<typeof wasRecorded>[1][];
    const result = await acceptReferralInvitation("tok-1", {
      first_name: "Ana", last_name: "Sintética", email: "ana.sintetica@example.test", password: "clave-ficticia-1",
      privacy_notice: REGISTERED.request.body!.privacy_notice as { version: string; sha256: string }, consents, client_request_id: "attempt-x",
    });
    expect(result.user.id).toBe(response.user.id);
    for (const consent of consents) expect(wasRecorded(result.privacy, consent)).toBe(true);
    expect(sent("POST /api/v1/invitations/tok-1/accept")[0]).toMatchObject({ consents });
  });
});

describe("KYC start against API #118's examples", () => {
  beforeEach(() => {
    (fetchMyAffiliateProfile as jest.Mock).mockResolvedValue({ id: "aff-1", affiliate_code: "AFF100", status: "pending", joined_at: "2026-01-01", activated_at: null, metadata: null, created_at: "2026-01-01" });
    (fetchMyCompliance as jest.Mock).mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
  });

  it("09 → 10: missing, then granted with the session; the body is the example's, and only then can verification start", async () => {
    serve(MY_PRIVACY_MISSING, NOTICE, GRANTED);
    const view = await mount(<ComplianceScreen />, auth({ status: "signedIn", user: { id: "dcb52638-27b9-41ae-adbc-a489f04fb5bb" } as AuthContextValue["user"] }));
    await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
    expect(view.getByText(identity.text)).toBeTruthy();
    await pressId(view, "identity-consent-box");
    await press(view, "Registrar autorización");

    const [body] = sent("POST /api/v1/me/privacy/consents");
    const { client_request_id: _id, ...rest } = body;
    expect(rest).toEqual(GRANTED.request.body);
    await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
    await press(view, "Comenzar verificación");
    expect(startCompliance).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["08 (own session)", KYC_WITHOUT, "Antes de continuar, autoriza la verificación de identidad."],
    ["13 (assisted capture)", ASSISTED_WITHOUT, "La persona todavía no autoriza la verificación de identidad desde su propia cuenta. Solo ella puede hacerlo."],
    ["12 (sponsor decides for another)", SPONSOR_DECIDES, "Solo la persona puede decidir sobre sus autorizaciones, desde su propia cuenta."],
  ])("%s: the real client reads the 403 and the app explains who must act", async (_case, item, message) => {
    serve(item);
    const path = item.request.path.replace(/ \(.*\)$/, "");
    const error = await apiRequest(path, { method: item.request.method as "POST", body: item.request.body ?? undefined }).catch((cause: unknown) => cause);
    expect(friendlyMessage(error as ApiError)).toBe(message);
  });
});
