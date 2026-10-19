import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";
import { configureApiClient } from "../../api/client";
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
jest.mock("../../config/env", () => ({
  config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 },
}));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-id" });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

it("requests recovery anonymously and tells the user to check their email", async () => {
  fetchMock.mockResolvedValueOnce(new Response("{}", { status: 202 }));
  const screen = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "affiliate@example.com");
  await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/auth/forgot-password", expect.objectContaining({
    method: "POST", body: JSON.stringify({ email: "affiliate@example.com" }),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
  })));
  await waitFor(() => expect(screen.getByText(/Si el correo corresponde a una cuenta/)).toBeTruthy());
});


beforeEach(() => jest.clearAllMocks());

it("rejects an invalid email before requesting recovery", async () => {
  const screen = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "invalid");
  await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
  expect(screen.getByText("Escribe un correo electrónico válido.")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("normalizes email and explains server errors without blaming connectivity", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Internal error" }), { status: 500 }));
  const screen = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), " QA@EXAMPLE.COM ");
  await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/auth/forgot-password", expect.objectContaining({ body: JSON.stringify({ email: "qa@example.com" }) })));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByText(/Revisa tu conexión/)).toBeNull();
});

describe("phone-only recovery", () => {
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  async function requestCode() {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByText("Celular"));
    await fireEvent.changeText(screen.getByLabelText("Número de celular"), "55 1234 5678");
    await fireEvent.press(screen.getByText("Enviar código por SMS"));
    return screen;
  }

  it("requests an SMS code anonymously, then resets the password with it", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok", retry_after: 60 }));
    const screen = await requestCode();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/auth/forgot-password", expect.objectContaining({
      body: JSON.stringify({ phone: "+525512345678" }),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    })));
    await waitFor(() => expect(screen.getByText(/pedimos el envío de un código por SMS al •••• 5678\. Si no llega en unos minutos, pide otro\./)).toBeTruthy());
    expect(screen.getByText("Podrás pedir otro código en 60 s")).toBeTruthy();

    fetchMock.mockResolvedValueOnce(json({ message: "ok" }));
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123456");
    await fireEvent.changeText(screen.getByLabelText("Contraseña nueva"), "newpass12");
    await fireEvent.changeText(screen.getByLabelText("Confirma tu contraseña"), "newpass12");
    await fireEvent.press(screen.getByText("Cambiar contraseña"));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/api/v1/auth/reset-password", expect.objectContaining({
      body: JSON.stringify({ phone: "+525512345678", code: "123456", password: "newpass12", password_confirmation: "newpass12" }),
    })));
    await waitFor(() => expect(screen.getByText("Tu contraseña se actualizó. Inicia sesión con la nueva.")).toBeTruthy());
  });

  it("explains an expired code in Spanish and keeps the person on the code step", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "ok", retry_after: 60 }));
    const screen = await requestCode();
    await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());

    fetchMock.mockResolvedValueOnce(json({ message: "The code has expired.", errors: { code: ["The code has expired."] }, reason: "otp_expired" }, 422));
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "123456");
    await fireEvent.changeText(screen.getByLabelText("Contraseña nueva"), "newpass12");
    await fireEvent.changeText(screen.getByLabelText("Confirma tu contraseña"), "newpass12");
    await fireEvent.press(screen.getByText("Cambiar contraseña"));

    await waitFor(() => expect(screen.getByText("El código venció. Pide uno nuevo.")).toBeTruthy());
    expect(screen.queryByText(/has expired/)).toBeNull();
    expect(screen.getByLabelText("Código de verificación")).toBeTruthy();
  });

  it("never sends an incomplete number", async () => {
    const screen = await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByText("Celular"));
    await fireEvent.changeText(screen.getByLabelText("Número de celular"), "551234");
    await fireEvent.press(screen.getByText("Enviar código por SMS"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe un número de celular completo para el país elegido.")).toBeTruthy();
  });
});
