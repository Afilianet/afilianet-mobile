import { act, fireEvent, render } from "@testing-library/react-native";
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

jest.mock("../../auth/pendingReferral", () => ({
  usePendingReferral: () => mockPendingReferral,
  pendingReferralPath: (referral: { organizationId: string; code: string }) => `/join/${referral.organizationId}/${referral.code}`,
}));

// The invitation finder only ever calls these public, organization-free endpoints.
jest.mock("../../api/endpoints", () => ({ fetchRegistrationOrganizations: jest.fn(), resolveRegistrationCode: jest.fn() }));

let mockPendingReferral: { organizationId: string; code: string; savedAt: number } | null = null;

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
    registerFromReferral: jest.fn(), register: jest.fn(), refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(),
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


describe("Independent user home (access MVP)", () => {
  it("offers joining an organization later with this same account", async () => {
    const { findByText, getByLabelText } = await renderScreen();
    expect(await findByText("¿Te invitaron a una organización?")).toBeTruthy();
    expect(getByLabelText("Código de invitación o enlace")).toBeTruthy();
  });

  it("asks to verify a channel the server reports as unverified", async () => {
    mockedUseAuth.mockReturnValue({
      ...mockedUseAuth(),
      user: { id: "user-1", first_name: "Dana", email: null, phone: "+525512345678", email_verified_at: null, phone_verified_at: null },
    });
    const { getByText } = await renderScreen();
    expect(getByText("Verificar mi cuenta")).toBeTruthy();
  });

  it("does not ask to verify once the server reports every channel verified", async () => {
    mockedUseAuth.mockReturnValue({
      ...mockedUseAuth(),
      user: { id: "user-1", first_name: "Dana", email: null, phone: "+525512345678", email_verified_at: null, phone_verified_at: "2026-10-01T00:00:00Z" },
    });
    const { queryByText } = await renderScreen();
    expect(queryByText("Verificar mi cuenta")).toBeNull();
  });

  it("brings back an invitation still pending from before sign-in", async () => {
    mockPendingReferral = { organizationId: "org-1", code: "AFF100", savedAt: Date.now() };
    const { getByText } = await renderScreen();
    expect(getByText("Tienes una invitación pendiente.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText("Revisar invitación"));
    });
    expect(mockPush).toHaveBeenCalledWith("/join/org-1/AFF100");
  });
});
