import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import RegisterScreen from "../../app/(auth)/register";
import { fetchRegistrationOrganizations, resolveRegistrationCode } from "../../api/endpoints";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock("../../api/endpoints", () => ({ fetchRegistrationOrganizations: jest.fn(), resolveRegistrationCode: jest.fn() }));
const resolveCode = resolveRegistrationCode as jest.Mock;
const organizations = fetchRegistrationOrganizations as jest.Mock;
const option = { organization_id: "org-one", organization_name: "Mi organización", affiliate_code: "TEST1234", referrer_first_name: "Ana" };

beforeEach(() => {
  jest.clearAllMocks();
  resolveCode.mockResolvedValue([option]);
  organizations.mockResolvedValue({ data: [option], next_page: null });
});

it("resolves a code, shows the organization and sponsor, and opens the existing scoped registration", async () => {
  const screen = await render(<RegisterScreen />);
  await act(async () => fireEvent.changeText(screen.getByLabelText("Código de invitación o enlace"), " TEST1234 "));
  await act(async () => fireEvent.press(screen.getByText("Buscar invitación")));
  await waitFor(() => expect(screen.getByText("Te invitó Ana")).toBeTruthy());
  expect(resolveCode).toHaveBeenCalledWith("TEST1234");
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Continuar con Mi organización"));
  expect(mockPush).toHaveBeenCalledWith("/join/org-one/TEST1234");
});

it("offers only organizations from the public directory and uses their configured sponsor", async () => {
  const screen = await render(<RegisterScreen />);
  await act(async () => fireEvent.press(screen.getByText("Elegir organización")));
  await waitFor(() => expect(screen.getByText("Mi organización")).toBeTruthy());
  expect(organizations).toHaveBeenCalledWith("", 1);
  fireEvent.press(screen.getByText("Continuar con Mi organización"));
  expect(mockPush).toHaveBeenCalledWith("/join/org-one/TEST1234");
});

it("does not invent a sponsor or navigate when the code has no matches", async () => {
  resolveCode.mockResolvedValue([]);
  const screen = await render(<RegisterScreen />);
  await act(async () => fireEvent.changeText(screen.getByLabelText("Código de invitación o enlace"), "UNKNOWN"));
  await act(async () => fireEvent.press(screen.getByText("Buscar invitación")));
  await waitFor(() => expect(screen.getByText(/No encontramos una invitación/)).toBeTruthy());
  expect(mockPush).not.toHaveBeenCalled();
});

it("routes a pasted referral link locally and never opens its website", async () => {
  const screen = await render(<RegisterScreen />);
  await act(async () => fireEvent.changeText(screen.getByLabelText("Código de invitación o enlace"), "https://staging-admin.afilianet.mx/join/org-one/TEST1234"));
  await act(async () => fireEvent.press(screen.getByText("Buscar invitación")));
  expect(mockPush).toHaveBeenCalledWith("/join/org-one/TEST1234");
  expect(resolveCode).not.toHaveBeenCalled();
});
