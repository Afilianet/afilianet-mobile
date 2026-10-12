import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../../api/errors";
import { AuthContext, type AuthContextValue } from "../../../auth/AuthContext";
import LoginScreen from "../../../app/(auth)/login";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../../auth/pendingReferral", () => ({ usePendingReferral: () => null }));

function renderLogin(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    status: "signedOut",
    user: null,
    error: null,
    signIn: jest.fn(),
    registerFromReferral: jest.fn(), register: jest.fn(), refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  };
  return render(
    <AuthContext.Provider value={value}>
      <LoginScreen />
    </AuthContext.Provider>,
  );
}

describe("LoginScreen", () => {
  it("has no development token-paste fallback, in this (dev) test environment or otherwise", async () => {
    const { queryByText, queryByPlaceholderText } = await renderLogin();

    expect(queryByText(/access token/i)).toBeNull();
    expect(queryByText(/sign in with token/i)).toBeNull();
    expect(queryByPlaceholderText(/1\|abcdef/i)).toBeNull();
  });

  it("only exposes email and password fields", async () => {
    const { getByPlaceholderText } = await renderLogin();

    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(getByPlaceholderText("••••••••")).toBeTruthy();
  });
});


it("opens account creation directly from sign in", async () => {
  const screen = await renderLogin();
  fireEvent.press(screen.getByText("Crear cuenta"));
  expect(mockPush).toHaveBeenCalledWith("/(auth)/register");
});

describe("LoginScreen: email or mobile", () => {
  it("signs in with the mobile number in E.164 for the selected country", async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);
    const screen = await renderLogin({ signIn });
    await fireEvent.press(screen.getByText("Celular"));
    await fireEvent.changeText(screen.getByLabelText("Número de celular"), "55 1234 5678");
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), "secret123");
    await act(async () => {
      await fireEvent.press(screen.getByText("Iniciar sesión"));
    });
    expect(signIn).toHaveBeenCalledWith({ phone: "+525512345678" }, "secret123");
  });

  it("signs in with a normalized email", async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);
    const screen = await renderLogin({ signIn });
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), " Ana@Example.com ");
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), "secret123");
    await act(async () => {
      await fireEvent.press(screen.getByText("Iniciar sesión"));
    });
    expect(signIn).toHaveBeenCalledWith({ email: "ana@example.com" }, "secret123");
  });

  it("does not call the API with an incomplete mobile number", async () => {
    const signIn = jest.fn();
    const screen = await renderLogin({ signIn });
    await fireEvent.press(screen.getByText("Celular"));
    await fireEvent.changeText(screen.getByLabelText("Número de celular"), "551234");
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), "secret123");
    await act(async () => {
      await fireEvent.press(screen.getByText("Iniciar sesión"));
    });
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe un número de celular completo para el país elegido.")).toBeTruthy();
  });

  it("reports phone sign-in that the API does not support yet in Spanish", async () => {
    const screen = await renderLogin({ error: new ApiError("validation", "The email field is required.", 422, { email: ["The email field is required."] }) });
    await fireEvent.press(screen.getByText("Celular"));
    expect(screen.getByText("Revisa el correo. Puede que ya esté registrado; si es tuyo, inicia sesión.")).toBeTruthy();
    expect(screen.queryByText(/field is required/)).toBeNull();
  });

  it("offers recovery and joining with an invitation", async () => {
    const screen = await renderLogin();
    await fireEvent.press(screen.getByText("¿Olvidaste tu contraseña?"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/forgot-password");
    await fireEvent.press(screen.getByText("Tengo una invitación"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/invitation");
  });
});
