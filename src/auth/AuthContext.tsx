import { createContext, useContext } from "react";
import type { AccessIdentifier, AccountRegistration } from "../api/access";
import type { ApiError } from "../api/errors";
import type { User } from "../types/api";
import type { ReferralRegistration } from "../api/endpoints";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: ApiError | null;
  /** A bare string is an email (the original contract); phone sign-in passes {phone} in E.164. */
  signIn: (identifier: AccessIdentifier | string, password: string) => Promise<void>;
  /** Direct sign-up: no referral, no organization. Leads to channel verification. */
  register: (registration: AccountRegistration) => Promise<void>;
  registerFromReferral: (invitationToken: string, registration: ReferralRegistration) => Promise<void>;
  /** Re-reads the account from the server -- the only source of email/phone verification state. */
  refreshUser: () => Promise<User | null>;
  /** One-shot screen to show right after this session started (e.g. verification after sign-up). */
  onboardingRoute: string | null;
  consumeOnboardingRoute: () => void;
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
