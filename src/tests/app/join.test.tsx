import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchPublicReferral, startReferralInvitation } from "../../api/endpoints";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import JoinScreen from "../../app/join/[organizationId]/[code]";

const register = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ organizationId: "org-1", code: "AFF100" }),
}));
jest.mock("../../api/endpoints", () => ({
  fetchPublicReferral: jest.fn(),
  startReferralInvitation: jest.fn(),
}));

const lookup = fetchPublicReferral as jest.Mock;
const start = startReferralInvitation as jest.Mock;
const auth: AuthContextValue = {
  status: "signedOut",
  user: null,
  error: null,
  signIn: jest.fn(),
  registerFromReferral: register,
  signOut: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  lookup.mockResolvedValue({ id: "aff-1", affiliate_code: "AFF100", referrer_first_name: "Ana" });
  start.mockResolvedValue({ token: "private-token" });
  register.mockResolvedValue(undefined);
});

async function renderJoin() {
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = render(
      <AuthContext.Provider value={auth}>
        <JoinScreen />
      </AuthContext.Provider>,
    ) as unknown as Awaited<ReturnType<typeof render>>;
  });
  return view;
}

it("validates the scoped referral and registers with the invitation token", async () => {
  const view = await renderJoin();
  await waitFor(() => expect(view.getByText("Te invitó Ana")).toBeTruthy());
  expect(lookup).toHaveBeenCalledWith("org-1", "AFF100");
  await act(async () => {
    fireEvent.changeText(view.getByLabelText("Nombre"), "Bea");
    fireEvent.changeText(view.getByLabelText("Apellido"), "López");
    fireEvent.changeText(view.getByLabelText("Correo electrónico"), " Bea@example.com ");
    fireEvent.changeText(view.getByLabelText("Contraseña"), "strongpass1");
    fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "strongpass1");
  });
  await act(async () => {
    fireEvent.press(view.getByText("Crear cuenta"));
  });
  await waitFor(() =>
    expect(register).toHaveBeenCalledWith("private-token", {
      first_name: "Bea",
      last_name: "López",
      email: "bea@example.com",
      password: "strongpass1",
    }),
  );
  expect(start).toHaveBeenCalledTimes(1);
});

it("does not create an invitation for an invalid referral", async () => {
  lookup.mockRejectedValue(new ApiError("not_found", "Not found", 404));
  const view = await renderJoin();
  await waitFor(() => expect(view.getByText("Esta liga de referido no está disponible.")).toBeTruthy());
  expect(view.queryByText("Crear cuenta")).toBeNull();
  expect(start).not.toHaveBeenCalled();
});
