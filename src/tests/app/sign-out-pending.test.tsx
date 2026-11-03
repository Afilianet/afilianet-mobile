import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { listDrafts } from "../../features/surveys/library";
import { listOutbox } from "../../features/surveys/outbox";
import { useSafeSignOut } from "../../features/surveys/signOut";
import { listScopes, wipeScope } from "../../features/surveys/vault";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import SignOutPendingScreen from "../../app/sign-out-pending";

jest.setTimeout(30_000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
// The real pending-data detection runs; only storage is simulated.
jest.mock("../../features/surveys/vault", () => ({ wipeScope: jest.fn(async () => undefined), listScopes: jest.fn() }));
jest.mock("../../features/surveys/outbox", () => ({ syncOutbox: jest.fn(), listOutbox: jest.fn() }));
jest.mock("../../features/surveys/library", () => ({ listDrafts: jest.fn() }));
jest.mock("../../features/surveys/runtime", () => ({ surveySource: { kind: "fixture" } }));

const signOut = jest.fn(async () => undefined);
const SCOPE_A = { userId: "user-1", organizationId: "org-a" };
const SCOPE_B = { userId: "user-1", organizationId: "org-b" };

function auth(): AuthContextValue {
  return {
    status: "signedIn",
    user: { id: "user-1", first_name: "Ana", last_name: "P", email: "a@x.mx", phone: null, status: "active", email_verified_at: null, phone_verified_at: null, last_login_at: null, created_at: "" },
    error: null,
    signIn: jest.fn(),
    register: jest.fn(),
    registerFromReferral: jest.fn(),
    refreshUser: jest.fn(),
    onboardingRoute: null,
    consumeOnboardingRoute: jest.fn(),
    signOut,
  };
}

function orgs(): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [{ id: "org-a", name: "Acme" }, { id: "org-b", name: "Beta" }] as OrganizationContextValue["organizations"],
    activeOrganization: { id: "org-a", name: "Acme" } as OrganizationContextValue["activeOrganization"],
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
  };
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={auth()}>
      <OrganizationContext.Provider value={orgs()}>{children}</OrganizationContext.Provider>
    </AuthContext.Provider>
  );
}

type Pending = { scope: { userId: string; organizationId: string }; unsent: number; drafts: number };

function setPending(entries: Pending[]) {
  // A scope of ANOTHER account on the same phone must never count.
  (listScopes as jest.Mock).mockResolvedValue([...entries.map((entry) => entry.scope), { userId: "user-2", organizationId: "org-a" }]);
  const find = (scope: { userId: string; organizationId: string }) =>
    entries.find((entry) => entry.scope.userId === scope.userId && entry.scope.organizationId === scope.organizationId);
  (listOutbox as jest.Mock).mockImplementation(async (scope) => Array.from({ length: find(scope)?.unsent ?? 5 }, (_, i) => ({ id: `o-${i}` })));
  (listDrafts as jest.Mock).mockImplementation(async (scope) => Array.from({ length: find(scope)?.drafts ?? 5 }, (_, i) => ({ id: `d-${i}` })));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Sign-out with unsent surveys", () => {
  it("signs out directly when nothing is pending", async () => {
    setPending([]);
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(signOut).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("never signs out silently with pending data: it opens the explicit choice instead", async () => {
    setPending([{ scope: SCOPE_A, unsent: 2, drafts: 0 }]);
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/sign-out-pending");
  });

  it("lists what is pending per organization, and keeping it signs out without deleting anything", async () => {
    setPending([
      { scope: SCOPE_A, unsent: 2, drafts: 1 },
      { scope: SCOPE_B, unsent: 0, drafts: 1 },
    ]);
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<SignOutPendingScreen />, { wrapper: Providers });
    });
    expect(screen.getByText("Hay 4 encuestas guardadas en este teléfono que todavía no llegan al servidor.")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Cerrar sesión y conservarlas en este teléfono"));
    });
    expect(signOut).toHaveBeenCalled();
    expect(wipeScope).not.toHaveBeenCalled();
  });

  it("deletes only after an explicit confirmation, and only this account's data", async () => {
    setPending([
      { scope: SCOPE_A, unsent: 1, drafts: 0 },
      { scope: SCOPE_B, unsent: 1, drafts: 0 },
    ]);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<SignOutPendingScreen />, { wrapper: Providers });
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Cerrar sesión y borrarlas"));
    });
    expect(wipeScope).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === "Cerrar sesión y borrarlas")?.onPress?.();
    });
    expect((wipeScope as jest.Mock).mock.calls.map(([scope]) => scope)).toEqual([SCOPE_A, SCOPE_B]);
    expect(signOut).toHaveBeenCalled();
  });
});
