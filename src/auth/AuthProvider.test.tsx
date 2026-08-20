import { act, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { ApiError } from "../api/errors";
import * as SecureStore from "expo-secure-store";
import { fetchMe, signIn as signInRequest, signOutRequest } from "../api/endpoints";
import { AuthProvider } from "./AuthProvider";
import { useAuth, type AuthContextValue } from "./AuthContext";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("../api/endpoints", () => ({
  fetchMe: jest.fn(),
  signIn: jest.fn(),
  signOutRequest: jest.fn(),
}));

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockedFetchMe = fetchMe as jest.Mock;
const mockedSignIn = signInRequest as jest.Mock;
const mockedSignOutRequest = signOutRequest as jest.Mock;

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
