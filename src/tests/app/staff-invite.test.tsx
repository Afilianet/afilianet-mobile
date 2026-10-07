import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { acceptStaffInvitation, fetchStaffInvitation } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { useOrganization } from "../../state/OrganizationContext";
import StaffInviteScreen from "../../app/staff-invite/[token]";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ token: "invite-token-1" }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchStaffInvitation: jest.fn(),
  acceptStaffInvitation: jest.fn(),
}));

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../state/OrganizationContext", () => ({
  useOrganization: jest.fn(),
}));

const mockedFetchStaffInvitation = fetchStaffInvitation as jest.Mock;
const mockedAcceptStaffInvitation = acceptStaffInvitation as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseOrganization = useOrganization as jest.Mock;

const INVITATION = { organization: { id: "org-9", name: "Org Nueve" }, role: "manager" };

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetchStaffInvitation.mockResolvedValue(INVITATION);
  mockedUseOrganization.mockReturnValue({
    status: "ready",
    organizations: [],
    activeOrganization: null,
    error: null,
    selectOrganization: jest.fn(),
    refresh: mockRefresh,
  });
});

async function renderScreen() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(<StaffInviteScreen />);
  });
  return result;
}

describe("Staff invite: signed-in acceptance", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: "u1", first_name: "Dana" }, error: null, signIn: jest.fn(), registerFromReferral: jest.fn(), signOut: jest.fn() });
  });

  it("shows the inviting organization and role, then accepts with the existing session", async () => {
    mockedAcceptStaffInvitation.mockResolvedValue({ user: { id: "u1" }, organization: INVITATION.organization, role: "manager", token: null });
    const { findByText } = await renderScreen();

    expect(await findByText("Org Nueve")).toBeTruthy();
    expect(await findByText(/manager/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(await findByText("Unirme a Org Nueve"));
    });

    expect(mockedAcceptStaffInvitation).toHaveBeenCalledWith("invite-token-1", { authenticated: true });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(await findByText(/Ya formas parte de Org Nueve/)).toBeTruthy();
  });

  it("shows a friendly API error message and never crashes when acceptance fails with a known error kind", async () => {
    mockedAcceptStaffInvitation.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByText("Unirme a Org Nueve"));
    });

    expect(await findByText(/algo salió mal/i)).toBeTruthy();
    // Never crashes -- the invitation details are still visible, not replaced by an error screen.
    expect(await findByText("Org Nueve")).toBeTruthy();
  });

  it("falls back to a generic message for a non-API error, never crashing with a raw/technical message", async () => {
    mockedAcceptStaffInvitation.mockRejectedValue(new Error("boom"));
    const { findByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByText("Unirme a Org Nueve"));
    });

    expect(await findByText(/no se pudo procesar la invitación/i)).toBeTruthy();
  });
});

describe("Staff invite: signed-out visitor", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ status: "signedOut", user: null, error: null, signIn: jest.fn(), registerFromReferral: jest.fn(), signOut: jest.fn() });
  });

  it("prompts sign-in first, never attempting acceptance without a session", async () => {
    const { findByText, queryByText } = await renderScreen();

    expect(await findByText(/Inicia sesión con tu cuenta para aceptar/)).toBeTruthy();
    expect(queryByText("Unirme a Org Nueve")).toBeNull();
    expect(mockedAcceptStaffInvitation).not.toHaveBeenCalled();
  });
});

describe("Staff invite: invalid/expired token", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: "u1", first_name: "Dana" }, error: null, signIn: jest.fn(), registerFromReferral: jest.fn(), signOut: jest.fn() });
  });

  it("shows a clear not-found message instead of a broken screen", async () => {
    mockedFetchStaffInvitation.mockRejectedValue(new ApiError("not_found", "Not found.", 404));
    const { findByText } = await renderScreen();
    expect(await findByText(/Esta invitación ya no está disponible/)).toBeTruthy();
  });
});
