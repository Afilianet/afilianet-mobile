import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";
import VerifyAccountScreen from "../../app/verify-account";
import { accessErrorMessage } from "../../api/access";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { EmailVerificationCard } from "../../components/account/EmailVerificationCard";
import type { User } from "../../types/api";

/**
 * API #84 (fix/simulated-delivery-honesty @ 4644f0b, docs/notifications/
 * DELIVERY_MODES.md) against simulated HTTP (real client and screens; only
 * global fetch is replaced): when email cannot reach anyone, forgot-password
 * by email, email-verification and PATCH me/email answer
 * 503 {reason: "email_unavailable"}, identical for every address. Nothing was
 * sent, so no screen may say a link was sent.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null, pendingReferralPath: () => "/" }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const EMAIL_UNAVAILABLE = { message: "El envío de correos no está disponible por el momento.", reason: "email_unavailable" };
const UNAVAILABLE_COPY = "Por ahora no podemos enviar correos. No se envió ningún enlace; inténtalo más tarde.";

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => null });
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

const USER = {
  id: "user-1", first_name: "Ana", last_name: "Pérez", email: "ana@example.com", phone: null, status: "active",
  email_verified_at: null, phone_verified_at: null, last_login_at: null, created_at: "2026-10-01T00:00:00Z",
} as unknown as User;

function auth(user: User): AuthContextValue {
  return {
    status: "signedIn", user, error: null, signIn: jest.fn(), register: jest.fn(), registerFromReferral: jest.fn(),
    refreshUser: jest.fn().mockResolvedValue(user), onboardingRoute: null, consumeOnboardingRoute: jest.fn(), signOut: jest.fn(),
  };
}

describe("Password recovery by email", () => {
  async function requestFor(email: string) {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), email);
    await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
    return screen;
  }

  it("503 email_unavailable: says nothing was sent, keeps the address and never shows «Revisa tu correo»", async () => {
    fetchMock.mockResolvedValueOnce(json(EMAIL_UNAVAILABLE, 503));
    const screen = await requestFor("ana@example.com");

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy());
    expect(screen.queryByText("Revisa tu correo")).toBeNull();
    expect(screen.getByLabelText("Correo electrónico").props.value).toBe("ana@example.com");
  });

  it("no enumeration: a registered and an unregistered address get the same screen", async () => {
    const shown: string[] = [];
    for (const email of ["ana@example.com", "nadie@example.com"]) {
      fetchMock.mockResolvedValueOnce(json(EMAIL_UNAVAILABLE, 503));
      const screen = await requestFor(email);
      await waitFor(() => expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy());
      shown.push(JSON.stringify(screen.toJSON()).replace(email, "<email>"));
      await screen.unmount();
    }
    expect(shown[0]).toBe(shown[1]);
  });

  it("the generic 200 is unchanged: «Revisa tu correo» without saying whether the account exists", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok" }));
    const screen = await requestFor("ana@example.com");
    await waitFor(() => expect(screen.getByText("Revisa tu correo")).toBeTruthy());
    expect(screen.queryByText(UNAVAILABLE_COPY)).toBeNull();
  });
});

describe("Email verification in Verificar cuenta", () => {
  async function renderVerify() {
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<AuthContext.Provider value={auth(USER)}><VerifyAccountScreen /></AuthContext.Provider>);
    });
    return screen;
  }

  it("503 on the first request: unavailable copy, never «Te enviamos un enlace», no resend wait", async () => {
    fetchMock.mockResolvedValueOnce(json(EMAIL_UNAVAILABLE, 503));
    const screen = await renderVerify();
    await act(async () => { fireEvent.press(screen.getByText("Enviar enlace de confirmación")); });

    expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy();
    expect(screen.queryByText(/Te enviamos un enlace/)).toBeNull();
    expect(screen.queryByText(/Reenviar en|Podrás/)).toBeNull();
  });

  it("503 on a resend: the earlier «Te enviamos un enlace» is removed", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 202 }));
    const screen = await renderVerify();
    await act(async () => { fireEvent.press(screen.getByText("Enviar enlace de confirmación")); });
    expect(screen.getByText(/Te enviamos un enlace/)).toBeTruthy();

    for (let second = 0; second < 61; second += 1) await act(async () => { jest.advanceTimersByTime(1000); });
    fetchMock.mockResolvedValueOnce(json(EMAIL_UNAVAILABLE, 503));
    await act(async () => { fireEvent.press(screen.getByText("Reenviar enlace")); });

    expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy();
    expect(screen.queryByText(/Te enviamos un enlace/)).toBeNull();
  });
});

describe("Email card in Perfil", () => {
  it("503: unavailable copy, and neither «Solicitud recibida» nor «el enlace que te enviamos»", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/auth/email-verification") ? json(EMAIL_UNAVAILABLE, 503) : json({ data: USER })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = await render(<QueryClientProvider client={client}><EmailVerificationCard user={USER} /></QueryClientProvider>);
    expect(view.getByText(/desde el enlace que te enviamos/)).toBeTruthy();

    await act(async () => { fireEvent.press(view.getByText("Reenviar correo de verificación")); });

    await waitFor(() => expect(view.getByText(UNAVAILABLE_COPY)).toBeTruthy());
    expect(view.queryByText(/Solicitud recibida/)).toBeNull();
    expect(view.queryByText(/desde el enlace que te enviamos/)).toBeNull();
    await view.unmount();
    client.clear();
  });
});

describe("accessErrorMessage", () => {
  it("maps email_unavailable (also PATCH me/email, which no Mobile screen calls yet)", () => {
    expect(accessErrorMessage(new ApiError("server", "El envío de correos no está disponible por el momento.", 503, undefined, { reason: "email_unavailable" }))).toBe(UNAVAILABLE_COPY);
  });
});
