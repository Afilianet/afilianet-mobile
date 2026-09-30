import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";
import { apiRequest } from "../../api/client";
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));

it("requests recovery anonymously and tells the user to check their email", async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({});
  const screen = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "affiliate@example.com");
  await fireEvent.press(screen.getByText("Enviar enlace de recuperación"));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/auth/forgot-password", {
    method: "POST", body: { email: "affiliate@example.com" },
    skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true,
  }));
  await waitFor(() => expect(screen.getByText(/Si el correo corresponde a una cuenta/)).toBeTruthy());
});
