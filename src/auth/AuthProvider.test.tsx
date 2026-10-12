import { act, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { ApiError } from "../api/errors";
import * as SecureStore from "expo-secure-store";
import { registerAccount, signInWith } from "../api/access";
import { acceptReferralInvitation, fetchMe, signOutRequest } from "../api/endpoints";
import { AuthProvider } from "./AuthProvider";
import { useAuth, type AuthContextValue } from "./AuthContext";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("../api/access", () => ({
  signInWith: jest.fn(),
  registerAccount: jest.fn(),
}));

jest.mock("../api/endpoints", () => ({
  fetchMe: jest.fn(),
  signOutRequest: jest.fn(),
  acceptReferralInvitation: jest.fn(),
}));

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockedFetchMe = fetchMe as jest.Mock;
const mockedSignIn = signInWith as jest.Mock;
const mockedRegisterAccount = registerAccount as jest.Mock;
const mockedSignOutRequest = signOutRequest as jest.Mock;
const mockedAcceptReferral = acceptReferralInvitation as jest.Mock;

let authValue: AuthContextValue;

function Capture() {
  const auth = useAuth();
  useEffect(() => {
    authValue = auth;
  });
  return null;
}

async function renderAuth() {
  await act(async () => {
    await render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
  });
  await waitFor(() => expect(authValue.status).not.toBe("loading"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
});

describe("AuthProvider: login", () => {
  it("stores the token returned by referral acceptance and signs in", async () => {
    mockedAcceptReferral.mockResolvedValue({ token: "new-token", user: { id: "user-2", first_name: "Bea" } });
    await renderAuth();
    await act(async () => {
      await authValue.registerFromReferral("invitation-token", {
        first_name: "Bea", last_name: "López", email: "bea@example.com", password: "strongpass1",
      });
    });
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), "new-token");
    expect(authValue.status).toBe("signedIn");
    expect(authValue.user?.first_name).toBe("Bea");
  });
  it("starts signed out when there's no stored token", async () => {
    await renderAuth();
    expect(authValue.status).toBe("signedOut");
  });

  it("on successful login: stores the token securely, then loads the user via /me", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1", first_name: "FromLogin" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "FromMe" });

    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), "tok-abc");
    expect(mockedFetchMe).toHaveBeenCalledTimes(1);
    expect(authValue.status).toBe("signedIn");
    // /me is authoritative, not the user embedded in the login response.
    expect(authValue.user?.first_name).toBe("FromMe");
  });

  it("surfaces invalid credentials (401) and does not sign in", async () => {
    mockedSignIn.mockRejectedValue(new ApiError("unauthorized", "These credentials do not match our records.", 401));

    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "wrong").catch(() => {});
    });

    expect(authValue.status).toBe("signedOut");
    expect(authValue.error?.kind).toBe("unauthorized");
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it("surfaces a restricted account (403) and does not sign in", async () => {
    mockedSignIn.mockRejectedValue(new ApiError("forbidden", "This account has been suspended.", 403));

    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2").catch(() => {});
    });

    expect(authValue.status).toBe("signedOut");
    expect(authValue.error?.kind).toBe("forbidden");
    expect(authValue.error?.message).toBe("This account has been suspended.");
  });

  it("surfaces a rate limit (429) and does not sign in", async () => {
    mockedSignIn.mockRejectedValue(new ApiError("rate_limited", "Too Many Attempts.", 429));

    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2").catch(() => {});
    });

    expect(authValue.status).toBe("signedOut");
    expect(authValue.error?.kind).toBe("rate_limited");
  });
});

describe("AuthProvider: logout", () => {
  async function signInFirst() {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });
    expect(authValue.status).toBe("signedIn");
  }

  it("calls the API and clears local session", async () => {
    mockedSignOutRequest.mockResolvedValue(undefined);
    await signInFirst();

    await act(async () => {
      await authValue.signOut();
    });

    expect(mockedSignOutRequest).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).toHaveBeenCalled();
    expect(authValue.status).toBe("signedOut");
    expect(authValue.user).toBeNull();
  });

  it("still clears the local session when the server call fails (offline)", async () => {
    mockedSignOutRequest.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
    await signInFirst();

    await act(async () => {
      await authValue.signOut();
    });

    expect(mockedSignOutRequest).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).toHaveBeenCalled();
    expect(authValue.status).toBe("signedOut");
    expect(authValue.user).toBeNull();
  });
});

describe("AuthProvider: session restore", () => {
  it("stored token -> /me succeeds -> signed in", async () => {
    mockedGetItem.mockResolvedValue("stored-token");
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Restored" });

    await renderAuth();

    expect(authValue.status).toBe("signedIn");
    expect(authValue.user?.first_name).toBe("Restored");
  });

  it("401 during restore clears the token and returns to signed out", async () => {
    mockedGetItem.mockResolvedValue("stale-token");
    mockedFetchMe.mockRejectedValue(new ApiError("unauthorized", "Unauthenticated.", 401));

    await renderAuth();

    expect(authValue.status).toBe("signedOut");
    expect(mockedDeleteItem).toHaveBeenCalled();
  });

  it("offline during restore keeps the token instead of destroying it", async () => {
    mockedGetItem.mockResolvedValue("stored-token");
    mockedFetchMe.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));

    await renderAuth();

    expect(authValue.status).toBe("signedIn");
    expect(mockedDeleteItem).not.toHaveBeenCalled();
    expect(authValue.error?.kind).toBe("offline");
  });
});

describe("AuthProvider: access by email or mobile", () => {
  it("signs in with a phone identifier exactly as given (E.164)", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-phone", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", phone: "+525512345678", phone_verified_at: null });
    await renderAuth();

    await act(async () => {
      await authValue.signIn({ phone: "+525512345678" }, "hunter22");
    });

    expect(mockedSignIn).toHaveBeenCalledWith({ phone: "+525512345678" }, "hunter22");
    expect(authValue.status).toBe("signedIn");
  });

  it("keeps a bare string as an email sign-in", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1" });
    await renderAuth();

    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    expect(mockedSignIn).toHaveBeenCalledWith({ email: "person@example.com" }, "hunter2");
  });

  it("registers directly, loads the server's user and continues to verification", async () => {
    mockedRegisterAccount.mockResolvedValue({ token: "tok-new", user: { id: "user-9" } });
    mockedFetchMe.mockResolvedValue({ id: "user-9", phone: "+525512345678", phone_verified_at: null });
    await renderAuth();

    await act(async () => {
      await authValue.register({ first_name: "Ana", last_name: "Pérez", phone: "+525512345678", password: "secret123", password_confirmation: "secret123" });
    });

    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), "tok-new");
    expect(authValue.user?.phone_verified_at).toBeNull();
    expect(authValue.onboardingRoute).toBe("/verify-account");
    await act(async () => {
      authValue.consumeOnboardingRoute();
    });
    expect(authValue.onboardingRoute).toBeNull();
  });

  it("refreshUser adopts the server's verification state, and never revives an account after sign-out", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", phone_verified_at: null });
    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    mockedFetchMe.mockResolvedValueOnce({ id: "user-1", phone_verified_at: "2026-10-12T10:00:00Z" });
    await act(async () => {
      await authValue.refreshUser();
    });
    expect(authValue.user?.phone_verified_at).toBe("2026-10-12T10:00:00Z");

    let resolveMe!: (value: unknown) => void;
    mockedFetchMe.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
    // Nothing renders until it resolves, so it is started outside act.
    const pending = authValue.refreshUser();
    await act(async () => {
      await authValue.signOut();
    });
    await act(async () => {
      resolveMe({ id: "user-1", phone_verified_at: "x" });
      await pending;
    });

    expect(authValue.status).toBe("signedOut");
    expect(authValue.user).toBeNull();
  });

  it("clears a pending referral when the session ends, so it never reaches another account", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1" });
    await renderAuth();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });
    mockedDeleteItem.mockClear();

    await act(async () => {
      await authValue.signOut();
    });

    expect(mockedDeleteItem).toHaveBeenCalledWith("afilianet.pendingReferral");
  });
});
