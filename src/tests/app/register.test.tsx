import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import RegisterScreen from "../../app/(auth)/register";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock("../../auth/pendingReferral", () => ({ usePendingReferral: () => mockPendingReferral }));

let mockPendingReferral: { organizationId: string; code: string; savedAt: number } | null = null;
const register = jest.fn();

function auth(): AuthContextValue {
  return {
    status: "signedOut",
    user: null,
    error: null,
    signIn: jest.fn(),
    register,
    registerFromReferral: jest.fn(),
    refreshUser: jest.fn(),
    onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(),
    signOut: jest.fn(),
  };
}

async function renderRegister() {
  return render(
    <AuthContext.Provider value={auth()}>
      <RegisterScreen />
    </AuthContext.Provider>,
  );
}

async function fill(screen: Awaited<ReturnType<typeof renderRegister>>, values: { email?: string; phone?: string; password?: string; confirmation?: string }) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Nombre"), " Ana ");
    fireEvent.changeText(screen.getByLabelText("Apellidos"), " Pérez ");
    if (values.email !== undefined) fireEvent.changeText(screen.getByLabelText("Correo electrónico"), values.email);
    if (values.phone !== undefined) fireEvent.changeText(screen.getByLabelText("Número de celular"), values.phone);
    fireEvent.changeText(screen.getByLabelText("Contraseña"), values.password ?? "secret123");
    fireEvent.changeText(screen.getByLabelText("Confirma tu contraseña"), values.confirmation ?? values.password ?? "secret123");
  });
}

async function submit(screen: Awaited<ReturnType<typeof renderRegister>>) {
  await act(async () => {
    fireEvent.press(screen.getByText("Crear cuenta"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingReferral = null;
  register.mockResolvedValue(undefined);
});

describe("Direct registration -- the four identifier cases", () => {
  it("email only: sends the normalized email and no phone", async () => {
    const screen = await renderRegister();
    await fill(screen, { email: " ANA@Example.com " });
    await submit(screen);

    expect(register).toHaveBeenCalledWith({
      first_name: "Ana",
      last_name: "Pérez",
      email: "ana@example.com",
      password: "secret123",
      password_confirmation: "secret123",
    });
  });

  it("phone only: sends E.164 for the selected country and no email", async () => {
    const screen = await renderRegister();
    await fill(screen, { phone: "55 1234 5678" });
    await submit(screen);

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ phone: "+525512345678" }));
    expect(register.mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("both: sends both channels", async () => {
    const screen = await renderRegister();
    await fill(screen, { email: "ana@example.com", phone: "(555) 123-4567" });
    await act(async () => {
      fireEvent.press(screen.getByTestId("phone-country"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Estados Unidos (+1)"));
    });
    await submit(screen);

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@example.com", phone: "+15551234567" }));
  });

  it("neither: asks for at least one channel and calls nothing", async () => {
    const screen = await renderRegister();
    await fill(screen, {});
    await submit(screen);

    expect(screen.getByText("Escribe un correo, un celular o ambos.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });
});

describe("Direct registration -- validation and errors", () => {
  it("rejects an incomplete phone instead of guessing", async () => {
    const screen = await renderRegister();
    await fill(screen, { phone: "55 1234" });
    await submit(screen);

    expect(screen.getByText("El celular no está completo para el país elegido.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const screen = await renderRegister();
    await fill(screen, { email: "ana@example.com", password: "secret123", confirmation: "secret124" });
    await submit(screen);

    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("explains a taken phone in Spanish, never the API's raw text", async () => {
    register.mockRejectedValue(new ApiError("validation", "The phone has already been taken.", 422, { phone: ["The phone has already been taken."] }));
    const screen = await renderRegister();
    await fill(screen, { phone: "5512345678" });
    await submit(screen);

    expect(screen.getByText("Revisa el celular. Puede que ya esté registrado; si es tuyo, inicia sesión.")).toBeTruthy();
    expect(screen.queryByText(/already been taken/)).toBeNull();
  });

  it("says when direct registration is not deployed yet", async () => {
    register.mockRejectedValue(new ApiError("not_found", "Not Found", 404));
    const screen = await renderRegister();
    await fill(screen, { email: "ana@example.com" });
    await submit(screen);

    expect(screen.getByText("Esta opción todavía no está disponible. Inténtalo más tarde.")).toBeTruthy();
  });

  it("needs no organization or referral, and keeps a pending one for after sign-up", async () => {
    const plain = await renderRegister();
    expect(plain.getByText(/No necesitas una invitación/)).toBeTruthy();
    plain.unmount();

    mockPendingReferral = { organizationId: "org-1", code: "AFF100", savedAt: Date.now() };
    const withReferral = await renderRegister();
    expect(withReferral.getByText(/Tienes una invitación pendiente/)).toBeTruthy();
  });
});
