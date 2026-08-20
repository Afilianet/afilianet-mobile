import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { configureApiClient } from "../api/client";
import { isApiError } from "../api/errors";
import { fetchMe, signIn as signInRequest } from "../api/endpoints";
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
          tokenRef.current = result.token;
          await tokenStorage.setToken(result.token);
          setUser(result.user);
          setStatus("signedIn");
        } catch (err) {
          if (isApiError(err)) setError(err);
          throw err;
        }
      },
      async signInWithToken(token: string) {
        setError(null);
        try {
          await establishSession(token);
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
