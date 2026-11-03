import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchPublicReferral, startReferralInvitation } from "../../api/endpoints";
import { acceptReferralAsCurrentUser } from "../../api/access";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { clearPendingReferral, savePendingReferral } from "../../auth/pendingReferral";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { User } from "../../types/api";
import JoinScreen from "../../app/join/[organizationId]/[code]";

const register = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ organizationId: "org-1", code: "AFF100" }),
}));
jest.mock("../../api/endpoints", () => ({
  fetchPublicReferral: jest.fn(),
  startReferralInvitation: jest.fn(),
}));
jest.mock("../../api/access", () => ({
  ...jest.requireActual("../../api/access"),
  acceptReferralAsCurrentUser: jest.fn(),
}));
jest.mock("../../auth/pendingReferral", () => ({
  savePendingReferral: jest.fn(() => Promise.resolve()),
  clearPendingReferral: jest.fn(() => Promise.resolve()),
}));

const lookup = fetchPublicReferral as jest.Mock;
const start = startReferralInvitation as jest.Mock;
const auth: AuthContextValue = {
  status: "signedOut",
  user: null,
  error: null,
  signIn: jest.fn(),
  registerFromReferral: register, register: jest.fn(), refreshUser: jest.fn(), onboardingRoute: null, consumeOnboardingRoute: jest.fn(),
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

describe("Join: referral survives sign-up and sign-in", () => {
  it("keeps the referral pending for a visitor, so 'Ya tengo cuenta' or sign-up can come back to it", async () => {
    const view = await renderJoin();
    await waitFor(() => expect(view.getByText("Te invitó Ana")).toBeTruthy());
    expect(savePendingReferral).toHaveBeenCalledWith("org-1", "AFF100");
  });

  it("registers with a mobile number only, then continues to verification with nothing left pending", async () => {
    const view = await renderJoin();
    await waitFor(() => expect(view.getByText("Te invitó Ana")).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nombre"), "Bea");
      fireEvent.changeText(view.getByLabelText("Apellido"), "López");
      fireEvent.changeText(view.getByLabelText("Número de celular"), "55 1234 5678");
      fireEvent.changeText(view.getByLabelText("Contraseña"), "strongpass1");
      fireEvent.changeText(view.getByLabelText("Confirma tu contraseña"), "strongpass1");
    });
    await act(async () => {
      fireEvent.press(view.getByText("Crear cuenta"));
    });

    await waitFor(() => expect(register).toHaveBeenCalledWith("private-token", {
      first_name: "Bea",
      last_name: "López",
      phone: "+525512345678",
      password: "strongpass1",
    }));
    expect(clearPendingReferral).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/verify-account");
  });
});

describe("Join: later affiliation with the current account", () => {
  const MEMBER: User = {
    id: "user-1",
    first_name: "Carla",
    last_name: "Ruiz",
    email: null,
    phone: "+525512345678",
    status: "active",
    email_verified_at: null,
    phone_verified_at: "2026-10-01T00:00:00Z",
    last_login_at: null,
    created_at: "2026-10-01T00:00:00Z",
  };
  const accept = acceptReferralAsCurrentUser as jest.Mock;
  const refresh = jest.fn();

  function memberAuth(user: User = MEMBER): AuthContextValue {
    return { ...auth, status: "signedIn", user, signOut: jest.fn() };
  }

  function orgs(organizations: OrganizationContextValue["organizations"] = []): OrganizationContextValue {
    return { status: "ready", organizations, activeOrganization: organizations[0] ?? null, error: null, selectOrganization: jest.fn(), refresh };
  }

  function tree(authValue: AuthContextValue, orgValue = orgs()) {
    return (
      <AuthContext.Provider value={authValue}>
        <OrganizationContext.Provider value={orgValue}>
          <JoinScreen />
        </OrganizationContext.Provider>
      </AuthContext.Provider>
    );
  }

  async function renderMember(authValue = memberAuth(), orgValue = orgs()) {
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(tree(authValue, orgValue));
    });
    await waitFor(() => expect(view.getByText("Confirma tu invitación")).toBeTruthy());
    return view;
  }

  beforeEach(() => {
    accept.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
  });

  it("joins with the signed-in account -- no registration form, no second account", async () => {
    const view = await renderMember();
    expect(view.getByText("Te unirás con tu cuenta actual (Carla Ruiz). No se crea otra cuenta.")).toBeTruthy();
    expect(view.queryByLabelText("Contraseña")).toBeNull();
    expect(savePendingReferral).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByText("Unirme con mi cuenta"));
    });

    expect(start).toHaveBeenCalledWith("org-1", "AFF100");
    // Without a privacy block (an API before #91) the body stays {} exactly as before.
    expect(accept).toHaveBeenCalledWith("private-token", {});
    expect(register).not.toHaveBeenCalled();
    expect(clearPendingReferral).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("stops if the session changes while the invitation is being prepared", async () => {
    let resolveStart!: (value: { token: string }) => void;
    start.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const view = await renderMember();
    await act(async () => {
      fireEvent.press(view.getByText("Unirme con mi cuenta"));
    });

    await act(async () => {
      view.rerender(tree(memberAuth({ ...MEMBER, id: "user-2", first_name: "Otra" })));
    });
    await act(async () => {
      resolveStart({ token: "private-token" });
    });

    expect(accept).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each([
    ["a new affiliation", { organization_role: "affiliate", already_affiliated: false }],
    ["already in the network (API #78)", { organization_role: "affiliate", already_affiliated: true }],
  ])("an acceptance answered after the session changed (%s) never touches the new session", async (_case, answer) => {
    let resolveAccept!: (value: unknown) => void;
    accept.mockImplementationOnce(() => new Promise((resolve) => { resolveAccept = resolve; }));
    const view = await renderMember();
    await act(async () => {
      fireEvent.press(view.getByText("Unirme con mi cuenta"));
    });
    // Without a privacy block (an API before #91) the body stays {} exactly as before.
    expect(accept).toHaveBeenCalledWith("private-token", {});

    await act(async () => {
      view.rerender(tree(memberAuth({ ...MEMBER, id: "user-2", first_name: "Otra" })));
    });
    await act(async () => {
      resolveAccept(answer);
    });

    // The server already answered for the previous account: the new one keeps its pending referral and stays put.
    expect(clearPendingReferral).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(view.queryByTestId("join-already-affiliated")).toBeNull();
  });

  it("does not offer to join an organization the account already belongs to", async () => {
    const org = { id: "org-1", name: "Mi organización" } as OrganizationContextValue["organizations"][number];
    const view = await renderMember(memberAuth(), orgs([org]));
    expect(view.getByText("Ya perteneces a esta organización.")).toBeTruthy();
    expect(view.queryByText("Unirme con mi cuenta")).toBeNull();
  });

  it("already affiliated there (has_affiliate_profile: true): nothing to join", async () => {
    const org = { id: "org-1", name: "Mi organización", my_role: "affiliate", my_membership_status: "active", has_affiliate_profile: true } as OrganizationContextValue["organizations"][number];
    const view = await renderMember(memberAuth(), orgs([org]));
    expect(view.getByText("Ya perteneces a esta organización.")).toBeTruthy();
    expect(view.queryByText("Unirme con mi cuenta")).toBeNull();
  });

  it("a manager there WITHOUT a profile (API #75) may still join the network, keeping the role", async () => {
    const org = { id: "org-1", name: "Mi organización", my_role: "owner", my_membership_status: "active", has_affiliate_profile: false } as OrganizationContextValue["organizations"][number];
    accept.mockResolvedValue({ organization_role: "owner", already_affiliated: false });
    const view = await renderMember(memberAuth(), orgs([org]));
    expect(view.queryByText("Ya perteneces a esta organización.")).toBeNull();
    expect(view.getByText(/conservas tu rol de gestión/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText("Unirme con mi cuenta"));
    });
    // Without a privacy block (an API before #91) the body stays {} exactly as before.
    expect(accept).toHaveBeenCalledWith("private-token", {});
    expect(refresh).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it.each([
    ["the API says so (already_affiliated, API #78)", () => accept.mockResolvedValue({ organization_role: "affiliate", already_affiliated: true })],
    ["the API before #78 answers «ya está inscrito»", () => accept.mockRejectedValue(new ApiError("validation", "Este usuario ya está inscrito como afiliado en esta organización.", 422))],
  ])("an account already in the network is told so, with no error and no retry loop: %s", async (_case, arrange) => {
    arrange();
    const view = await renderMember();
    await act(async () => {
      fireEvent.press(view.getByText("Unirme con mi cuenta"));
    });

    expect(view.getByTestId("join-already-affiliated")).toBeTruthy();
    expect(view.getByText(/tu patrocinador sigue siendo el mismo/)).toBeTruthy();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.queryByText("Unirme con mi cuenta")).toBeNull();
    expect(clearPendingReferral).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByText("Ir al inicio"));
    });
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("can be dismissed, which forgets the pending referral", async () => {
    const view = await renderMember();
    await act(async () => {
      fireEvent.press(view.getByText("Ahora no"));
    });
    expect(clearPendingReferral).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
    expect(accept).not.toHaveBeenCalled();
  });
});
