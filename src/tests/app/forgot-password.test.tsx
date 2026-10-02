import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";
import { configureApiClient } from "../../api/client";
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
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
