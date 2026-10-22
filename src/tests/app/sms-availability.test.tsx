import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";
import VerifyAccountScreen from "../../app/verify-account";
import { configureApiClient } from "../../api/client";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import type { User } from "../../types/api";

/**
 * API #63 (ad663a0) SMS availability, against simulated HTTP (real client and
 * access functions; only global fetch is replaced):
 * - 503 {reason: "sms_unavailable"}: rejected before any code exists, so the
 *   screen never moves to "type the code" and keeps what was typed;
 * - 202/200 {delivery: "queued"}: accepted, not delivered -- never "sent".
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }) }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => null, pendingReferralPath: () => "/" }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const SMS_UNAVAILABLE = { message: "SMS is not available.", reason: "sms_unavailable" };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => null });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

const USER: User = {
  id: "user-1",
  first_name: "Ana",
  last_name: "Pérez",
  email: "ana@example.com",
  phone: "+525512345678",
  status: "active",
  email_verified_at: "2026-10-01T00:00:00Z",
  phone_verified_at: null,
  last_login_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

function auth(user: User): AuthContextValue {
  return {
    status: "signedIn",
    user,
    error: null,
    signIn: jest.fn(),
    register: jest.fn(),
    registerFromReferral: jest.fn(),
    refreshUser: jest.fn().mockResolvedValue(user),
    onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(),
    signOut: jest.fn(),
  };
}

async function renderVerify(user: User) {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(
      <AuthContext.Provider value={auth(user)}>
        <VerifyAccountScreen />
      </AuthContext.Provider>,
    );
  });
  return screen;
}

async function press(screen: Awaited<ReturnType<typeof render>>, text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

describe("Phone verification (signed in)", () => {
  it("503 sms_unavailable: specific message, stays before the code step, and offers email only because the account has one", async () => {
    fetchMock.mockResolvedValueOnce(json(SMS_UNAVAILABLE, 503));
    const screen = await renderVerify(USER);
    await press(screen, "Enviar código por SMS");

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/auth/phone-verification", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.")).toBeTruthy();
    expect(screen.getByText("Mientras tanto puedes seguir entrando con tu correo.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    expect(screen.queryByText(/Pedimos el envío/)).toBeNull();
    // No wait was started: it can be tried again later.
    expect(screen.queryByText(/Podrás pedir otro código/)).toBeNull();
  });

  it("503 for an account without email: never offers email as an alternative", async () => {
    fetchMock.mockResolvedValueOnce(json(SMS_UNAVAILABLE, 503));
    const screen = await renderVerify({ ...USER, email: null, email_verified_at: null } as unknown as User);
    await press(screen, "Enviar código por SMS");

    expect(screen.getByText("Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.")).toBeTruthy();
    expect(screen.queryByText(/correo/i)).toBeNull();
  });

  it("delivery=queued: moves to the code step without claiming the SMS was sent, and keeps the resend wait", async () => {
    fetchMock.mockResolvedValueOnce(json({ retry_after: 60, expires_in: 600, delivery: "queued" }, 202));
    const screen = await renderVerify(USER);
    await press(screen, "Enviar código por SMS");

    expect(screen.getByLabelText("Código de verificación")).toBeTruthy();
    expect(screen.getByText("Pedimos el envío de un código por SMS al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
    expect(screen.queryByText(/Enviamos un código/)).toBeNull();
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
  });

  it("503 when confirming the code: the typed code is kept and the person stays on the code step", async () => {
    fetchMock.mockResolvedValueOnce(json({ retry_after: 60, expires_in: 600, delivery: "queued" }, 202));
    const screen = await renderVerify(USER);
    await press(screen, "Enviar código por SMS");
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123456");
    });
    fetchMock.mockResolvedValueOnce(json(SMS_UNAVAILABLE, 503));
    await press(screen, "Verificar celular");

    // With API #79 a 503 here means no channel can check codes: it is not about sending SMS.
    expect(screen.getByText("Por ahora no podemos comprobar códigos. Tu código sigue escrito: inténtalo más tarde.")).toBeTruthy();
    expect(screen.getByLabelText("Código de verificación").props.value).toBe("123456");
  });
});

describe("Password recovery by phone (anonymous)", () => {
  async function requestCode() {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByText("Celular"));
    await fireEvent.changeText(screen.getByLabelText("Número de celular"), "55 1234 5678");
    await fireEvent.press(screen.getByText("Enviar código por SMS"));
    return screen;
  }

  it("503 sms_unavailable: keeps the number on the same step and offers email only conditionally, with a way to switch", async () => {
    fetchMock.mockResolvedValueOnce(json(SMS_UNAVAILABLE, 503));
    const screen = await requestCode();

    await waitFor(() => expect(screen.getByText("Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.")).toBeTruthy());
    expect(screen.getByText("Si tu cuenta también tiene correo, puedes recuperarla por correo. Si solo tiene celular, inténtalo más tarde.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
    expect(screen.queryByText(/pedimos el envío/)).toBeNull();
    expect(screen.getByLabelText("Número de celular").props.value).toBe("55 1234 5678");

    await fireEvent.press(screen.getByText("Recuperar con correo"));
    expect(screen.getByLabelText("Correo electrónico")).toBeTruthy();
  });

  it("delivery=queued: code step without claiming delivery; the resend wait applies", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok", retry_after: 60, delivery: "queued" }));
    const screen = await requestCode();
    await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/auth/forgot-password", expect.objectContaining({ body: JSON.stringify({ phone: "+525512345678" }) }));
    expect(screen.getByText(/pedimos el envío de un código por SMS al •••• 5678/)).toBeTruthy();
    expect(screen.queryByText(/enviamos un código/i)).toBeNull();
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
  });

  it("503 on reset: code and new password stay typed, nothing is lost", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok", retry_after: 60, delivery: "queued" }));
    const screen = await requestCode();
    await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123456");
    await fireEvent.changeText(screen.getByLabelText("Contraseña nueva"), "newpass12");
    await fireEvent.changeText(screen.getByLabelText("Confirma tu contraseña"), "newpass12");
    fetchMock.mockResolvedValueOnce(json(SMS_UNAVAILABLE, 503));
    await fireEvent.press(screen.getByText("Cambiar contraseña"));

    await waitFor(() => expect(screen.getByText("Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.")).toBeTruthy());
    expect(screen.getByLabelText("Código de verificación").props.value).toBe("123456");
    expect(screen.getByLabelText("Contraseña nueva").props.value).toBe("newpass12");
    expect(screen.queryByText("Tu contraseña se actualizó. Inicia sesión con la nueva.")).toBeNull();
  });

  it("email recovery is unchanged and never shows the SMS notice", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok" }));
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
    await waitFor(() => expect(screen.getByText("Revisa tu correo")).toBeTruthy());
    expect(screen.queryByText(/SMS/)).toBeNull();
  });
});
