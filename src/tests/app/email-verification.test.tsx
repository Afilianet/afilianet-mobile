import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { EmailVerificationCard } from "../../components/account/EmailVerificationCard";
import { apiRequest } from "../../api/client";
import { fetchMe } from "../../api/endpoints";
import type { User } from "../../types/api";

jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));
jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));
jest.mock("../../api/endpoints", () => ({ fetchMe: jest.fn() }));

const user = { id: "email-user", email: "qa@example.com", email_verified_at: null } as User;
beforeEach(() => { jest.clearAllMocks(); });

it("resends only for the signed-in account and prevents immediate repeat", async () => {
  (fetchMe as jest.Mock).mockResolvedValue(user);
  (apiRequest as jest.Mock).mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(<QueryClientProvider client={client}><EmailVerificationCard user={user} /></QueryClientProvider>);
  await fireEvent.press(view.getByText("Reenviar correo de verificación"));
  await waitFor(() => expect(view.getByText("Reenviar en 60 s")).toBeTruthy());
  await fireEvent.press(view.getByText("Reenviar en 60 s"));
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith("/auth/email-verification", { method: "POST", skipOrganization: true });
  await view.unmount();
  client.clear();
});

it("refreshes the authoritative email state after confirmation", async () => {
  (fetchMe as jest.Mock).mockResolvedValueOnce(user).mockResolvedValue({ ...user, email_verified_at: "2026-10-01T12:00:00Z" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(<QueryClientProvider client={client}><EmailVerificationCard user={user} /></QueryClientProvider>);
  await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(view.getByText("Ya confirmé mi correo")).toBeTruthy());
  await fireEvent.press(view.getByText("Ya confirmé mi correo"));
  await waitFor(() => expect(view.getByText("Correo confirmado")).toBeTruthy());
  expect(view.queryByText("Reenviar correo de verificación")).toBeNull();
  await view.unmount();
  client.clear();
});
