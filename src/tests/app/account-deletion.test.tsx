import { fireEvent, render, waitFor } from "@testing-library/react-native";
import DeleteAccountScreen from "../../app/delete-account";
import { configureApiClient } from "../../api/client";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "own-token", getOrganizationId: () => "selected-org" });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: null })));
});
afterEach(() => { global.fetch = originalFetch; configureApiClient({ getToken: () => null, getOrganizationId: () => null }); });

it("requires confirmation and submits for the account without a tenant header", async () => {
  const screen = await render(<DeleteAccountScreen />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await fireEvent.changeText(screen.getByLabelText("Contraseña actual"), "secret");
  await fireEvent.press(screen.getByText("Solicitar eliminación"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "request-1", status: "requested", completed_at: null } }), { status: 202 }));
  await fireEvent.changeText(screen.getByLabelText("Escribe ELIMINAR"), "ELIMINAR");
  await fireEvent.press(screen.getByText("Solicitar eliminación"));
  await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/api/v1/account/deletion-request", expect.objectContaining({
    method: "POST", body: JSON.stringify({ password: "secret", confirmation: "ELIMINAR" }),
    headers: { Accept: "application/json", Authorization: "Bearer own-token", "Content-Type": "application/json" },
  })));
  expect(await screen.findByText("Folio: request-1")).toBeTruthy();
  expect(screen.getByText(/todavía no se ha eliminado/)).toBeTruthy();
  expect(screen.queryByLabelText("Contraseña actual")).toBeNull();
});

it("does not claim success after a server failure", async () => {
  const screen = await render(<DeleteAccountScreen />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
  await fireEvent.changeText(screen.getByLabelText("Contraseña actual"), "secret");
  await fireEvent.changeText(screen.getByLabelText("Escribe ELIMINAR"), "ELIMINAR");
  await fireEvent.press(screen.getByText("Solicitar eliminación"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/Solicitud registrada/)).toBeNull();
});
