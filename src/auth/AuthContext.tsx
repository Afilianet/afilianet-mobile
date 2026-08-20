import { createContext, useContext } from "react";
import type { ApiError } from "../api/errors";
import type { User } from "../types/api";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

/**
 * What feature screens depend on. A future Cognito-backed provider can
 * implement this same shape and be swapped in at the root layout without
 * touching any screen that calls useAuth().
 */
export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: ApiError | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Dev-only escape hatch while afilianet-api has no login endpoint. */
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
}
