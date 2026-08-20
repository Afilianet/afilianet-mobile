import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { configureApiClient } from "../api/client";
import { isApiError } from "../api/errors";
import { fetchMe, signIn as signInRequest, signOutRequest } from "../api/endpoints";
import type { User } from "../types/api";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { tokenStorage } from "./tokenStorage";
import type { ApiError } from "../api/errors";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const tokenRef = useRef<string | null>(null);

  async function establishSession(token: string) {
    tokenRef.current = token;
    await tokenStorage.setToken(token);
    const me = await fetchMe();
    setUser(me);
    setStatus("signedIn");
  }

  async function signOut() {
    try {
      // Best-effort: revoke the token server-side. If this fails (offline,
      // token already invalid, ...) we still tear down the local session below --
      // a user must always be able to sign out of their device.
      await signOutRequest();
    } catch {
      // ignored -- local logout below always proceeds regardless.
    }
    tokenRef.current = null;
    await tokenStorage.clearToken();
    setUser(null);
    setError(null);
    setStatus("signedOut");
  }

  useEffect(() => {
    configureApiClient({
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        void signOut();
      },
    });
  }, []);

  useEffect(() => {
    (async () => {
      const storedToken = await tokenStorage.getToken();
      if (!storedToken) {
        setStatus("signedOut");
        return;
      }
      try {
        await establishSession(storedToken);
      } catch (err) {
        if (isApiError(err) && err.kind === "unauthorized") {
          await signOut();
          return;
        }
        // Offline or server error while restoring: keep the token so the
        // user isn't logged out just for launching without connectivity.
        tokenRef.current = storedToken;
        setStatus("signedIn");
        setError(isApiError(err) ? err : null);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      async signIn(email: string, password: string) {
        setError(null);
        try {
          const result = await signInRequest(email, password);
          // The login response already includes a User, but we still load
          // /api/v1/me via establishSession() so there's exactly one code
          // path (also used by session restore) that decides what "signed
          // in" means -- not two slightly-divergent ones.
          await establishSession(result.token);
        } catch (err) {
          if (isApiError(err)) setError(err);
          throw err;
        }
      },
      signOut,
    }),
    [status, user, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
