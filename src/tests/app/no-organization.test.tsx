import { act, render } from "@testing-library/react-native";
import { analytics } from "../../services/analytics";
import { useAuth } from "../../auth/AuthContext";
import NoOrganizationScreen from "../../app/no-organization";

const mockPush = jest.fn();
const mockSignOut = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    status: "signedIn",
    user: { id: "user-1", first_name: "Dana" },
    error: null,
    signIn: jest.fn(),
    registerFromReferral: jest.fn(),
    signOut: mockSignOut,
  });
});

async function renderScreen() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(<NoOrganizationScreen />);
  });
  return result;
}

describe("No-organization empty state", () => {
  it("renders a useful Spanish empty state, never a broken/blank screen", async () => {
    const { findByText } = await renderScreen();
    expect(await findByText("Sin organización activa")).toBeTruthy();
    expect(await findByText(/Tu cuenta sigue activa/)).toBeTruthy();
  });

  it("offers a path to platform-wide notifications and to the profile", async () => {
    const { findByText } = await renderScreen();
    expect(await findByText("Ver notificaciones de Afilianet")).toBeTruthy();
    expect(await findByText("Ver mi perfil")).toBeTruthy();
  });

  it("fires no tenant-scoped navigation and no analytics properties beyond the view event", async () => {
    await renderScreen();
    const call = mockedCapture.mock.calls.find(([event]) => event === "no_organization_viewed");
    expect(call).toHaveLength(1);
  });
});
