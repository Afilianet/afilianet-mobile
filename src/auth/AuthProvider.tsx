import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { unregisterPush } from "../services/push";
import { queryClient } from "../api/queryClient";
import { configureApiClient } from "../api/client";
import { isApiError } from "../api/errors";
import { registerAccount, signInWith } from "../api/access";
import { acceptReferralInvitation, fetchMe, signOutRequest } from "../api/endpoints";
import type { User } from "../types/api";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { clearPendingReferral, hydratePendingReferral, watchPendingReferralExpiry } from "./pendingReferral";
import { tokenStorage } from "./tokenStorage";
import { clearPrivacyReview } from "../state/privacyReview";
import { forgetOfflineUser, restoreOfflineUser, saveOfflineUser } from "../services/offlineSession";
import type { ApiError } from "../api/errors";

/**
 * A session is "current" only while its token is the active one. Every await
 * in this provider can lose a race with sign-out or another sign-in; after
 * each, nothing from the old session may be published or persisted.
 */
function sessionGuard(tokenRef: { current: string | null }, token: string): () => boolean {
  return () => tokenRef.current === token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [onboardingRoute, setOnboardingRoute] = useState<string | null>(null);

  async function establishSession(token: string) {
    if (tokenRef.current !== token) {
      queryClient.clear();
      // A notice review belongs to the account that was asked for it.
      clearPrivacyReview();
    }
    tokenRef.current = token;
    await tokenStorage.setToken(token);
    const me = await fetchMe();
    if (!sessionGuard(tokenRef, token)()) return;
    await saveOfflineUser(token, me, sessionGuard(tokenRef, token)).catch(() => undefined);
    if (!sessionGuard(tokenRef, token)()) return;
    setUser(me);
    setStatus("signedIn");
  }

  // One sign-out at a time: a second call (a double tap, or a 401 of a query
  // still in flight) joins the running one instead of repeating the requests.
  const signingOut = useRef<Promise<void> | null>(null);

  // Stable: it only touches refs, state setters and module-level services.
  const signOut = useCallback((options: { tokenRevoked?: boolean } = {}): Promise<void> => {
    async function runSignOut({ tokenRevoked = false }: { tokenRevoked?: boolean }) {
      // A token the server already refused (401) is never sent again: DELETE
      // push/devices and auth/logout would only answer 401. The server drops the
      // device together with the session anyway.
      if (!tokenRevoked && tokenRef.current) {
        let revoked = false;
        try {
          await unregisterPush();
        } catch (cause) {
          // A 409 (an API that still blocks it during a notice review) or offline:
          // the logout itself still runs. A 401: the session is gone already.
          revoked = isApiError(cause) && cause.kind === "unauthorized";
        }
        if (!revoked) {
          try {
            // Best-effort: revoke the token server-side. If this fails (offline,
            // token already invalid, ...) we still tear down the local session below --
            // a user must always be able to sign out of their device.
            await signOutRequest();
          } catch {
            // ignored -- local logout below always proceeds regardless.
          }
        }
      }
      // No request after this one can carry the session's token.
      tokenRef.current = null;
      // Signed out is published BEFORE the cache goes (physical round P3, 2026-10-28):
      // clearing it first, with the session's screens still mounted and the user
      // still set, made them ask for their data again right after auth/logout.
      setUser(null);
      setError(null);
      // An unaccepted referral and any post-sign-up step belong to this session only.
      setOnboardingRoute(null);
      setStatus("signedOut");
      await clearPendingReferral();
      await tokenStorage.clearToken();
      await forgetOfflineUser().catch(() => undefined);
      // By now every session query is disabled: emptying the cache asks for nothing,
      // and an answer still in flight lands in a cache that is then cleared.
      clearPrivacyReview();
      queryClient.clear();
    }
    signingOut.current ??= runSignOut(options).finally(() => {
      signingOut.current = null;
    });
    return signingOut.current;
  }, []);

  useEffect(() => {
    configureApiClient({
      getToken: () => tokenRef.current,
      onUnauthorized: (requestToken) => {
        // Only the session still signed in, and never while it is already signing out.
        if (!requestToken || requestToken !== tokenRef.current || signingOut.current) return;
        void signOut({ tokenRevoked: true });
      },
    });
  }, [signOut]);

  useEffect(() => {
    (async () => {
      await hydratePendingReferral();
      watchPendingReferralExpiry();
      const storedToken = await tokenStorage.getToken();
      if (!storedToken) {
        setStatus("signedOut");
        return;
      }
      try {
        await establishSession(storedToken);
      } catch (err) {
        if (isApiError(err) && err.kind === "unauthorized") {
          await signOut({ tokenRevoked: true });
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
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      async signIn(identifier, password) {
        setError(null);
        try {
          const result = await signInWith(identifier, password);
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
        clearPrivacyReview();
        tokenRef.current = result.token;
        await tokenStorage.setToken(result.token);
        await saveOfflineUser(result.token, result.user, sessionGuard(tokenRef, result.token)).catch(() => undefined);
        if (!sessionGuard(tokenRef, result.token)()) return;
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
        if (!sessionGuard(tokenRef, token)()) return null;
        // The write itself re-checks right before writing (see saveOfflineUser);
        // and the session is checked again after it before publishing anything.
        await saveOfflineUser(token, me, sessionGuard(tokenRef, token)).catch(() => undefined);
        if (!sessionGuard(tokenRef, token)()) return null;
        setUser(me);
        return me;
      },
      onboardingRoute,
      consumeOnboardingRoute() {
        setOnboardingRoute(null);
      },
      // Callers sign out by hand: the server calls run (no event can pass as options).
      signOut: () => signOut(),
    }),
    [status, user, error, onboardingRoute, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
