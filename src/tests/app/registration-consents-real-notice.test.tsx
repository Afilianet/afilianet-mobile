import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { acceptReferralInvitation, fetchMyAffiliateProfile, fetchMyCompliance, startCompliance } from "../../api/endpoints";
import type { RecordedPrivacy } from "../../api/privacy";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { completeRegistrationReceipt } from "../../auth/registrationReceipt";
import { RegistrationReceiptCard } from "../../components/privacy/RegistrationReceiptCard";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import ComplianceScreen from "../../app/compliance";
import JoinScreen from "../../app/join/[organizationId]/[code]";
import contract from "../support/api-contract/registration-consents-real-notice-66060a1.json";

/**
 * The REAL notice 2026-11-03-general.2 (still pending approval; approved only
 * inside the API's own test) served by API #119 @ 66060a1, verbatim, to the
 * real client and screens: the texts the demo would show, and the referral
 * lookup's `verification_expected` where the API really puts it.
 */
type Example = { request: { method: string; path: string; body?: Record<string, unknown> | null }; status: number; response: unknown };
const example = (name: string) => (contract.examples as Record<string, Example>)[name];
const NOTICE = example("02-aviso-real-con-finalidades-200");
const REGISTERED = example("04-registro-aviso-real-201");
const MISSING = example("09-mi-privacidad-aviso-real-faltante-200");
const GRANTED = example("10-otorgar-aviso-real-200");
const GRANTED_REPLAY = example("10b-otorgar-aviso-real-reintento-200");
const LOOKUP = example("15-referido-verification-expected-200");
type Purpose = { key: string; title: string; text: string; help: string | null; text_sha256: string };
const notice = (NOTICE.response as { data: { version: string; purposes: Purpose[]; simplified_notice: string } }).data;
const identity = notice.purposes.find((purpose) => purpose.key === "identity_verification")!;
const quality = notice.purposes.find((purpose) => purpose.key === "quality_testing")!;
const [, , , organizationId, , code] = LOOKUP.request.path.split("/").slice(1);

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 200 } }));
jest.mock("../../auth/pendingReferral", () => ({
  usePendingReferral: () => null,
  savePendingReferral: jest.fn(() => Promise.resolve()),
  clearPendingReferral: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../features/surveys/signOut", () => ({ useSafeSignOut: () => jest.fn() }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));
jest.mock("../../api/endpoints", () => ({
  ...jest.requireActual("../../api/endpoints"),
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(async () => []),
}));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));

const calls: { route: string; body: Record<string, unknown> | undefined }[] = [];
let served: Record<string, { status: number; response: unknown }[]> = {};
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? "GET"} ${url.replace("https://api.test", "")}`;
  calls.push({ route, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const queue = served[route];
  if (!queue?.length) throw new Error(`Unexpected request ${route}`);
  const answer = queue.length > 1 ? queue.shift()! : queue[0];
  return new Response(JSON.stringify(answer.response), { status: answer.status, headers: { "Content-Type": "application/json" } });
});
const serve = (route: string, ...answers: { status: number; response: unknown }[]) => { served[route] = answers; };
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

const organization: OrganizationContextValue = {
  status: "ready", organizations: [], activeOrganization: { id: "org-a", name: "Acme" } as OrganizationContextValue["activeOrganization"],
  error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};
const auth = (overrides: Partial<AuthContextValue> = {}) => ({
  status: "signedOut", user: null, error: null, signIn: jest.fn(), register: jest.fn(),
  // The provider's order (AuthProvider.registerFromReferral): the real POST, then the receipt for that account.
  registerFromReferral: jest.fn(async (token: string, registration: Parameters<AuthContextValue["registerFromReferral"]>[1]) => {
    const result = await acceptReferralInvitation(token, registration);
    completeRegistrationReceipt(result.user.id, result.privacy);
  }),
  refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(), ...overrides,
}) as AuthContextValue;

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
const pressId = async (view: View, testID: string) => act(async () => { fireEvent.press(view.getByTestId(testID)); });
const press = async (view: View, text: string) => act(async () => { fireEvent.press(view.getByText(text)); });

it("the real texts: lengths as the API reported, and nothing pending in them", () => {
  expect(identity.text).toHaveLength(220);
  expect(quality.text).toHaveLength(220);
  expect(notice.simplified_notice).toHaveLength(618);
  expect(identity.text_sha256).toBe("258a58df839a15dd593fa15838533ff324023f831a66ff19517b16561c507af1");
  expect(quality.text_sha256).toBe("0720d0e93e775e05b960283418f3df9bd778d79ce54d7e96541e774bdeb1b3c5");
  expect(JSON.stringify(notice)).not.toMatch(/PENDIENTE/);
});

it("joining by link with the real lookup (15) and notice (02): the three boxes with the real texts; what 04 stored reads as recorded", async () => {
  // Example 04 sends quality_testing as an explicit `refused`; the app never does (an unticked box sends nothing),
  // so here only the identity box is ticked and the body is compared with the example's granted decisions.
  mockParams = { organizationId, code };
  serve(`GET ${LOOKUP.request.path}`, LOOKUP);
  serve("GET /api/v1/privacy/notice", NOTICE);
  serve(`POST /api/v1/organizations/${organizationId}/referrals/${code}/invitations`, { status: 200, response: { data: { token: "tok-real" } } });
  const registered = REGISTERED.response as { token: string; user: { id: string }; privacy: RecordedPrivacy };
  serve("POST /api/v1/invitations/tok-real/accept", {
    status: 200,
    response: { data: { user: registered.user, organization_role: "affiliate", affiliate: { id: "aff-x", affiliate_code: "AFF200", status: "pending" }, token: registered.token, already_affiliated: false, privacy: registered.privacy } },
  });
  const view = await mount(<JoinScreen />, auth());
  await waitFor(() => expect(view.getByTestId("consent-identity_verification")).toBeTruthy());
  expect(view.getByText(identity.text)).toBeTruthy();
  expect(view.getByText(identity.help!)).toBeTruthy();
  expect(view.getByText(quality.text)).toBeTruthy();
  expect(view.getByText(notice.simplified_notice)).toBeTruthy();

  await act(async () => {
    fireEvent.changeText(view.getByLabelText("Nombre"), "Ana");
    fireEvent.changeText(view.getByLabelText("Apellido"), "Sintética");
    fireEvent.changeText(view.getByLabelText("Correo electrónico"), "ana.sintetica@example.test");
    fireEvent.changeText(view.getByLabelText("Contraseña"), "clave-ficticia-1");
    fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "clave-ficticia-1");
  });
  await pressId(view, "notice-confirmation");
  await pressId(view, "consent-box-identity_verification");
  await press(view, "Crear cuenta");

  const [body] = sent("POST /api/v1/invitations/tok-real/accept");
  expect(body.consents).toEqual((REGISTERED.request.body!.consents as { decision: string }[]).filter((consent) => consent.decision === "granted"));
  expect(body.privacy_notice).toEqual(REGISTERED.request.body!.privacy_notice);
  const card = await render(<RegistrationReceiptCard userId={registered.user.id} />);
  expect(card.getByText(`Registrada: ${identity.title}`)).toBeTruthy();
  // Not sent, so not listed: the receipt only covers what this step sent.
  expect(card.queryByText(new RegExp(quality.title.replace(/[()]/g, "\\$&")))).toBeNull();
});

it("KYC start with the real notice (09 → 10, and the replay 10b answers the same)", async () => {
  (fetchMyAffiliateProfile as jest.Mock).mockResolvedValue({ id: "aff-1", affiliate_code: "AFF100", status: "pending", joined_at: "2026-11-03", activated_at: null, metadata: null, created_at: "2026-11-03" });
  (fetchMyCompliance as jest.Mock).mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
  (startCompliance as jest.Mock).mockResolvedValue({ id: "case-1" });
  serve("GET /api/v1/me/privacy", MISSING);
  serve("GET /api/v1/privacy/notice", NOTICE);
  serve("POST /api/v1/me/privacy/consents", GRANTED);
  expect(GRANTED_REPLAY.response).toEqual(GRANTED.response);

  const view = await mount(<ComplianceScreen />, auth({ status: "signedIn", user: { id: "user-a" } as AuthContextValue["user"] }));
  await waitFor(() => expect(view.getByTestId("identity-consent-box")).toBeTruthy());
  expect(view.getByText(identity.text)).toBeTruthy();
  await pressId(view, "identity-consent-box");
  await press(view, "Registrar autorización");
  const { client_request_id: _id, ...body } = sent("POST /api/v1/me/privacy/consents")[0];
  const { client_request_id: _exampleId, ...exampleBody } = GRANTED.request.body!;
  expect(body).toEqual(exampleBody);
  await waitFor(() => expect(view.getByTestId("identity-consent-effective")).toBeTruthy());
});
