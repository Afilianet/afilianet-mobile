import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { PushPreferences } from "../../components/PushPreferences";
import { apiRequest } from "../../api/client";

jest.mock("../../state/OrganizationContext", () => ({ useOrganization: () => ({ activeOrganization: { id: "org-one", name: "Mi organización" } }) }));
jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));
jest.mock("../../services/push", () => ({ registerPush: jest.fn() }));
const api = apiRequest as jest.Mock;
beforeEach(() => { api.mockReset(); api.mockResolvedValue({ data: { service_push: true, promotions: false, consent_version: "2026-10-05.1" } }); });
it("starts promotions off and records explicit choice only on save", async () => {
  const screen = await render(<PushPreferences />);
  await waitFor(() => expect(screen.getByLabelText("Acepto promociones de esta organización").props.value).toBe(false));
  await fireEvent(screen.getByLabelText("Acepto promociones de esta organización"), "valueChange", true);
  expect(api.mock.calls.filter(c => c[1]?.method === "PUT")).toHaveLength(0);
  await act(async () => { await fireEvent.press(screen.getByText("Guardar preferencias")); });
  expect(api).toHaveBeenCalledWith("/api/v1/notifications/preferences", expect.objectContaining({ method: "PUT", skipOrganization: true, headers: { "X-Organization-ID": "org-one" }, body: expect.objectContaining({ promotions: true }) }));
});
