import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { unregisterPush } from "../services/push";
import { queryClient } from "../api/queryClient";
import { configureApiClient } from "../api/client";
import { isApiError } from "../api/errors";
import { registerAccount, signInWith } from "../api/access";
import { acceptReferralInvitation, fetchMe, signOutRequest } from "../api/endpoints";
import type { User } from "../types/api";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { clearPendingReferral, hydratePendingReferral } from "./pendingReferral";
import { tokenStorage } from "./tokenStorage";
import { forgetOfflineUser, restoreOfflineUser, saveOfflineUser } from "../services/offlineSession";
import type { ApiError } from "../api/errors";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [onboardingRoute, setOnboardingRoute] = useState<string | null>(null);

  async function establishSession(token: string) {
    if (tokenRef.current !== token) queryClient.clear();
    tokenRef.current = token;
    await tokenStorage.setToken(token);
    const me = await fetchMe();
    await saveOfflineUser(token, me).catch(() => undefined);
    setUser(me);
    setStatus("signedIn");
  }

  async function signOut() {
    await unregisterPush().catch(() => undefined);
    try {
      // Best-effort: revoke the token server-side. If this fails (offline,
      // token already invalid, ...) we still tear down the local session below --
      // a user must always be able to sign out of their device.
      await signOutRequest();
    } catch {
      // ignored -- local logout below always proceeds regardless.
    }
    tokenRef.current = null;
    queryClient.clear();
    // An unaccepted referral and any post-sign-up step belong to this session only.
    setOnboardingRoute(null);
    await clearPendingReferral();
    await tokenStorage.clearToken();
    await forgetOfflineUser().catch(() => undefined);
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
      await hydratePendingReferral();
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
        if (isApiError(err) && (err.kind === "offline" || err.kind === "timeout")) {
          setUser(await restoreOfflineUser(storedToken));
        }
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
      async signIn(identifier, password) {
        setError(null);
        try {
          const result = await signInWith(typeof identifier === "string" ? { email: identifier } : identifier, password);
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
      async registerFromReferral(invitationToken, registration) {
        setError(null);
        const result = await acceptReferralInvitation(invitationToken, registration);
        if (!result.token) throw new Error("The registration did not return a session token.");
        queryClient.clear();
        tokenRef.current = result.token;
        await tokenStorage.setToken(result.token);
        await saveOfflineUser(result.token, result.user).catch(() => undefined);
        setUser(result.user);
        setStatus("signedIn");
      },
      async register(registration) {
        setError(null);
        const result = await registerAccount(registration);
        if (!result.token) throw new Error("The registration did not return a session token.");
        setOnboardingRoute("/verify-account");
        await establishSession(result.token);
      },
      async refreshUser() {
        if (!tokenRef.current) return null;
        const token = tokenRef.current;
        const me = await fetchMe();
        // A sign-out or another sign-in while this was in flight must not
        // resurrect the previous account.
        if (tokenRef.current !== token) return null;
        await saveOfflineUser(token, me).catch(() => undefined);
        setUser(me);
        return me;
      },
      onboardingRoute,
      consumeOnboardingRoute() {
        setOnboardingRoute(null);
      },
      signOut,
    }),
    [status, user, error, onboardingRoute],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
