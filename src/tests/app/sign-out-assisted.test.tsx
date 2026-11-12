import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { listDrafts } from "../../features/surveys/library";
import { listOutbox } from "../../features/surveys/outbox";
import { useSafeSignOut } from "../../features/surveys/signOut";
import { listScopes, wipeScope } from "../../features/surveys/vault";
import { countPendingAssistedForUser, listPendingAssisted, savePendingAssisted } from "../../services/assistedQueue";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import SignOutPendingScreen from "../../app/sign-out-pending";

jest.setTimeout(30_000);

// The real assisted queue runs on an in-memory secure store: drafts are read, never deleted, by sign-out.
const mockStore = new Map<string, string>();
const mockRemove = jest.fn(async (key: string) => void mockStore.delete(key));
jest.mock("../../services/storage", () => ({
  secureStorage: {
    get: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
    remove: (key: string) => mockRemove(key),
  },
}));
jest.mock("../../services/assistedEvidenceVault", () => ({ openAssistedPhoto: jest.fn(), removeAssistedPhoto: jest.fn() }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("../../features/surveys/vault", () => ({ wipeScope: jest.fn(async () => undefined), listScopes: jest.fn() }));
jest.mock("../../features/surveys/outbox", () => ({ syncOutbox: jest.fn(), listOutbox: jest.fn() }));
jest.mock("../../features/surveys/library", () => ({ listDrafts: jest.fn() }));
jest.mock("../../features/surveys/runtime", () => ({ surveySource: { kind: "fixture" } }));

const signOut = jest.fn(async () => undefined);
const SCOPE_A = { userId: "user-1", organizationId: "org-a" };

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

async function draft(sponsorUserId: string, organizationId: string, requestId: string) {
  await savePendingAssisted({
    sponsorUserId,
    organizationId,
    input: { first_name: "Persona", last_name: "Ficticia", phone: "+525512345678", client_request_id: requestId, consent_confirmed: true },
  });
}

function surveysPending(unsent: number) {
  (listScopes as jest.Mock).mockResolvedValue(unsent ? [SCOPE_A] : []);
  (listOutbox as jest.Mock).mockResolvedValue(Array.from({ length: unsent }, (_, i) => ({ id: `o-${i}` })));
  (listDrafts as jest.Mock).mockResolvedValue([]);
}

type AlertButton = { text: string; onPress?: () => void };
const assistedKeys = () => mockRemove.mock.calls.map(([key]) => key).filter((key) => key.startsWith("afn.assisted."));

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("Sign-out with pending assisted-enrollment drafts", () => {
  it("counts every organization of this account, never another account's drafts", async () => {
    await draft("user-1", "org-a", "req-a");
    await draft("user-1", "org-b", "req-b");
    await draft("user-2", "org-a", "req-other");
    expect(await countPendingAssistedForUser("user-1")).toBe(2);
    expect(await countPendingAssistedForUser("user-2")).toBe(1);
    expect(await countPendingAssistedForUser("user-3")).toBe(0);
  });

  it("signs out directly when nothing is pending (another account's drafts do not count)", async () => {
    surveysPending(0);
    await draft("user-2", "org-a", "req-other");
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("with only assisted drafts it asks first; Cancelar keeps the session", async () => {
    surveysPending(0);
    await draft("user-1", "org-a", "req-a");
    await draft("user-1", "org-b", "req-b");
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe("Registros pendientes");
    expect(message).toBe("Tienes 2 registros pendientes. Se conservarán cifrados en este teléfono y solo aparecerán al volver a entrar con esta cuenta.");
    // Only Cancelar and Continuar: no option deletes the drafts.
    expect(buttons.map((button) => button.text)).toEqual(["Cancelar", "Continuar"]);

    await act(async () => {
      buttons[0].onPress?.();
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("Continuar signs out and the drafts stay on the phone for this account", async () => {
    surveysPending(0);
    await draft("user-1", "org-a", "req-a");
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(alert.mock.calls[0][1]).toBe("Tienes 1 registro pendiente. Se conservarán cifrados en este teléfono y solo aparecerán al volver a entrar con esta cuenta.");
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons.find((button) => button.text === "Continuar")?.onPress?.();
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assistedKeys()).toEqual([]);
    expect((await listPendingAssisted("user-1", "org-a")).map((item) => item.input.client_request_id)).toEqual(["req-a"]);
  });

  it("with surveys too, it keeps today's survey flow and only adds a line; deleting surveys never touches the drafts", async () => {
    surveysPending(1);
    await draft("user-1", "org-a", "req-a");
    await draft("user-1", "org-b", "req-b");
    const hook = await renderHook(() => useSafeSignOut(), { wrapper: Providers });
    await act(async () => {
      await hook.result.current();
    });
    expect(mockPush).toHaveBeenCalledWith("/sign-out-pending");
    expect(alert).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();

    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<SignOutPendingScreen />, { wrapper: Providers });
    });
    expect(screen.getByText("Hay 1 encuesta guardada en este teléfono que todavía no llegan al servidor.")).toBeTruthy();
    expect(screen.getByTestId("sign-out-pending-assisted").props.children).toBe(
      "También tienes 2 registros pendientes. Ninguna opción los borra: se conservarán cifrados en este teléfono y solo aparecerán al volver a entrar con esta cuenta.",
    );

    await act(async () => {
      fireEvent.press(screen.getByText("Cerrar sesión y borrarlas"));
    });
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons.find((button) => button.text === "Cerrar sesión y borrarlas")?.onPress?.();
    });
    expect((wipeScope as jest.Mock).mock.calls.map(([scope]) => scope)).toEqual([SCOPE_A]);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assistedKeys()).toEqual([]);
    expect(await countPendingAssistedForUser("user-1")).toBe(2);
  });

  it("shows no assisted line when this account has no drafts", async () => {
    surveysPending(1);
    await draft("user-2", "org-a", "req-other");
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<SignOutPendingScreen />, { wrapper: Providers });
    });
    expect(screen.queryByTestId("sign-out-pending-assisted")).toBeNull();
  });
});
