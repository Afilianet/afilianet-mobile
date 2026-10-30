import { act, fireEvent, render, within } from "@testing-library/react-native";
import { requestEmailVerification, requestPhoneVerification, verifyPhone } from "../../api/access";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import VerifyAccountScreen from "../../app/verify-account";
import type { User } from "../../types/api";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("../../auth/pendingReferral", () => ({
  usePendingReferral: () => mockPendingReferral,
  pendingReferralPath: (referral: { organizationId: string; code: string }) => `/join/${referral.organizationId}/${referral.code}`,
}));
jest.mock("../../api/access", () => {
  const actual = jest.requireActual("../../api/access");
  return { ...actual, requestEmailVerification: jest.fn(), requestPhoneVerification: jest.fn(), verifyPhone: jest.fn() };
});

let mockPendingReferral: { organizationId: string; code: string; savedAt: number } | null = null;
const mockedRequestPhone = requestPhoneVerification as jest.Mock;
const mockedVerifyPhone = verifyPhone as jest.Mock;
const mockedRequestEmail = requestEmailVerification as jest.Mock;

const BASE_USER: User = {
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

function auth(user: User, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
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
    ...overrides,
  };
}

async function renderVerify(value: AuthContextValue) {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(
      <AuthContext.Provider value={value}>
        <VerifyAccountScreen />
      </AuthContext.Provider>,
    );
  });
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingReferral = null;
  mockedRequestPhone.mockResolvedValue({ retryAfterSeconds: 60, expiresInSeconds: 600, channel: "sms" });
  mockedVerifyPhone.mockResolvedValue({ ...BASE_USER, phone_verified_at: "2026-10-12T10:00:00Z" });
  mockedRequestEmail.mockResolvedValue(undefined);
});

describe("Verify account", () => {
  it("shows each channel's state exactly as the server reports it, and completes the post-sign-up step", async () => {
    const value = auth(BASE_USER);
    const screen = await renderVerify(value);

    expect(within(screen.getByTestId("verify-email")).getByText("Verificado")).toBeTruthy();
    expect(within(screen.getByTestId("verify-phone")).getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("+52 55 1234 5678")).toBeTruthy();
    expect(value.consumeOnboardingRoute).toHaveBeenCalled();
  });

  it("sends the SMS code, shows where it went, and blocks resending during the wait", async () => {
    const screen = await renderVerify(auth(BASE_USER));
    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });

    // Accepted ("queued") is not delivered: the copy never claims it arrived.
    expect(screen.getByText("Pedimos el envío de un código por SMS al •••• 5678. Si no llega en unos minutos, pide otro.")).toBeTruthy();
    expect(screen.getByText("El código vence en 10 min.")).toBeTruthy();
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Pedir otro código por SMS"));
    });
    expect(mockedRequestPhone).toHaveBeenCalledTimes(1);
    expect(mockedRequestPhone).toHaveBeenCalledWith("sms");
  });

  it("treats the phone as verified only after the server's user says so", async () => {
    // The verify call succeeds, but the server's user still has no phone_verified_at.
    const refreshUser = jest.fn().mockResolvedValue(BASE_USER);
    const screen = await renderVerify(auth(BASE_USER, { refreshUser }));
    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123 456");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Verificar celular"));
    });

    expect(mockedVerifyPhone).toHaveBeenCalledWith("123456");
    expect(refreshUser).toHaveBeenCalled();
    expect(screen.queryByText("Tu celular quedó verificado.")).toBeNull();
    expect(within(screen.getByTestId("verify-phone")).getByText("Pendiente")).toBeTruthy();
  });

  it("explains an expired code and lets the person request a new one right away", async () => {
    mockedVerifyPhone.mockRejectedValue(new ApiError("validation", "Expired", 422, { code: ["Expired"] }, { reason: "otp_expired" }));
    const screen = await renderVerify(auth(BASE_USER));
    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123456");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Verificar celular"));
    });

    expect(screen.getByText("El código venció. Pide uno nuevo.")).toBeTruthy();
    expect(screen.queryByLabelText("Código de verificación")).toBeNull();
  });

  it("waits as long as the API says when sending is rate limited", async () => {
    mockedRequestPhone.mockRejectedValue(new ApiError("rate_limited", "Too Many Attempts.", 429, undefined, { retryAfterSeconds: 30 }));
    const screen = await renderVerify(auth(BASE_USER));
    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });

    // The default build offers SMS only, so the wait never mentions WhatsApp.
    expect(screen.getByText("Espera 30 segundos antes de intentarlo de nuevo.")).toBeTruthy();
    expect(screen.getByText("Podrás pedir otro código en 30 s")).toBeTruthy();
    // Registration already sent a code (one per minute): the person can type it right away.
    expect(screen.getByLabelText("Código de verificación")).toBeTruthy();
  });

  it("by default (no WhatsApp switch in the build) offers SMS only: no channel choice and no WhatsApp anywhere", async () => {
    const screen = await renderVerify(auth(BASE_USER));
    expect(screen.queryByText("¿Cómo quieres recibir el código?")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });
    expect(mockedRequestPhone).toHaveBeenCalledWith("sms");
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });

  it("by default, SMS unavailable never suggests WhatsApp", async () => {
    mockedRequestPhone.mockRejectedValue(new ApiError("server", "SMS is not available.", 503, undefined, { reason: "sms_unavailable" }));
    const screen = await renderVerify(auth(BASE_USER));
    await act(async () => {
      fireEvent.press(screen.getByText("Enviar código por SMS"));
    });
    expect(screen.getByText("Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.")).toBeTruthy();
    expect(screen.getByText("Mientras tanto puedes seguir entrando con tu correo.")).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });

  it("re-reads the server before claiming the email is confirmed", async () => {
    const pendingEmail = { ...BASE_USER, email_verified_at: null, phone: null };
    const refreshUser = jest.fn().mockResolvedValue(pendingEmail);
    const screen = await renderVerify(auth(pendingEmail, { refreshUser }));
    await act(async () => {
      fireEvent.press(screen.getByText("Ya confirmé mi correo"));
    });

    expect(refreshUser).toHaveBeenCalled();
    expect(screen.getByText("Todavía no vemos tu correo confirmado. Abre el enlace y vuelve a intentarlo.")).toBeTruthy();
    expect(screen.queryByTestId("verify-phone")).toBeNull();
  });

  it("continues to a pending referral, otherwise Home", async () => {
    const verified = { ...BASE_USER, phone_verified_at: "2026-10-12T10:00:00Z" };
    mockPendingReferral = { organizationId: "org-1", code: "AFF100", savedAt: Date.now() };
    const withReferral = await renderVerify(auth(verified));
    await act(async () => {
      fireEvent.press(withReferral.getByText("Continuar"));
    });
    expect(mockReplace).toHaveBeenLastCalledWith("/join/org-1/AFF100");
    withReferral.unmount();

    mockPendingReferral = null;
    const plain = await renderVerify(auth(BASE_USER));
    await act(async () => {
      fireEvent.press(plain.getByText("Hacerlo después"));
    });
    expect(mockReplace).toHaveBeenLastCalledWith("/(app)");
  });
});
