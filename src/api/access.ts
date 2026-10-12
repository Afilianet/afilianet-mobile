import { strings } from "../i18n";
import type { LoginResponse, User } from "../types/api";
import { apiRequest } from "./client";
import { ApiError, friendlyMessage, isApiError } from "./errors";

/**
 * Account access: sign-in, registration, channel verification and recovery.
 *
 * Two kinds of calls live here, and the difference matters:
 *
 * EXISTING in afilianet-api (feat/platform-users-notifications @ 53b1086):
 * - POST /api/v1/auth/login with {email, password}
 * - POST /api/v1/auth/forgot-password with {email} (emailed link)
 * - POST /api/v1/auth/email-verification (authenticated, emailed link)
 * - POST /api/v1/invitations/{token}/accept as an AUTHENTICATED user: joins
 *   the referral's organization with the current account (token: null, no
 *   second account).
 *
 * NEW in afilianet-api PR #50 (feat/unified-account-access @ b1d4269, built on
 * #45, not merged yet; contract: docs/auth/ACCOUNT_ACCESS_CONTRACT.md):
 * - POST /api/v1/auth/register -- direct sign-up, no referral/organization
 * - POST /api/v1/auth/phone-verification, POST /api/v1/auth/verify-phone -- SMS OTP
 * - POST /api/v1/auth/login with {phone, password}
 * - POST /api/v1/auth/forgot-password with {phone}; POST /api/v1/auth/reset-password
 *   with {phone, code, password, password_confirmation}
 * Proposed conventions: a top-level `reason` code on 422/429 and
 * `retry_after` (seconds) on 202/429. Until deployed these return 404/405,
 * which `accessErrorMessage` reports as "not available yet" -- never as a
 * success, and never as a verified channel.
 *
 * Verification state is ONLY ever read from the server's user
 * (email_verified_at / phone_verified_at). Nothing here marks a channel
 * verified on the client.
 */

/** Exactly one channel: phone is always E.164 (see utils/phone.ts). */
export type AccessIdentifier = { email: string } | { phone: string };

export interface AccountRegistration {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  password: string;
  password_confirmation: string;
}

export interface CodeDelivery {
  /** Seconds before another code may be requested. */
  retryAfterSeconds: number;
  /** Seconds the code stays valid, when the API says. */
  expiresInSeconds?: number;
}

const PUBLIC = { skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true } as const;
const DEFAULT_RESEND_SECONDS = 60;

export async function signInWith(identifier: AccessIdentifier, password: string): Promise<LoginResponse> {
  // Flat {token, user}, not {data}: see LoginResponse in types/api.ts.
  return apiRequest<LoginResponse>("/api/v1/auth/login", { method: "POST", body: { ...identifier, password }, ...PUBLIC });
}

/** PROPOSED. Direct registration without referral or organization. */
export async function registerAccount(registration: AccountRegistration): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/v1/auth/register", { method: "POST", body: registration, ...PUBLIC });
}

/** EXISTING. Emails a confirmation link to the signed-in user's address. */
export async function requestEmailVerification(): Promise<void> {
  await apiRequest("/api/v1/auth/email-verification", { method: "POST", skipOrganization: true });
}

type Maybe<T> = T & { data?: T };

/** Sends (or re-sends) the SMS code to the signed-in user's phone. The contract answers flat: 202 {retry_after, expires_in}. */
export async function requestPhoneVerification(): Promise<CodeDelivery> {
  const body = await apiRequest<Maybe<{ retry_after?: number; expires_in?: number }> | null>("/api/v1/auth/phone-verification", {
    method: "POST",
    skipOrganization: true,
  });
  const delivery = body?.data ?? body;
  return { retryAfterSeconds: delivery?.retry_after ?? DEFAULT_RESEND_SECONDS, expiresInSeconds: delivery?.expires_in };
}

/** Returns the server's user (contract: 200 {user}); phone_verified_at is the only source of truth. */
export async function verifyPhone(code: string): Promise<User> {
  const body = await apiRequest<Maybe<{ user?: User }>>("/api/v1/auth/verify-phone", {
    method: "POST",
    body: { code },
    skipOrganization: true,
  });
  const user = body?.user ?? body?.data?.user;
  if (!user) throw new ApiError("unknown", "Unexpected verify-phone response.");
  return user;
}

/** EXISTING for {email}; PROPOSED for {phone}. The answer is generic either way (no account enumeration). */
export async function requestPasswordRecovery(identifier: AccessIdentifier): Promise<CodeDelivery> {
  const response = await apiRequest<{ retry_after?: number } | null>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: identifier,
    ...PUBLIC,
  });
  return { retryAfterSeconds: response?.retry_after ?? DEFAULT_RESEND_SECONDS };
}

/** PROPOSED. Phone recovery: the SMS code plus the new password. */
export async function resetPasswordWithPhoneCode(input: {
  phone: string;
  code: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await apiRequest("/api/v1/auth/reset-password", { method: "POST", body: input, ...PUBLIC });
}

/**
 * EXISTING. Accepts a referral invitation as the signed-in user: the API
 * joins that organization with this same account (no new account, token null).
 */
export async function acceptReferralAsCurrentUser(invitationToken: string): Promise<void> {
  await apiRequest(`/api/v1/invitations/${encodeURIComponent(invitationToken)}/accept`, {
    method: "POST",
    body: {},
    skipOrganization: true,
  });
}

/** Spanish copy for every access failure; OTP reasons map to their own message. */
export function accessErrorMessage(error: unknown): string {
  const copy = strings.access.errors;
  if (!isApiError(error)) return strings.shared.genericError;
  switch (error.reason) {
    case "otp_invalid":
      return copy.otpInvalid;
    case "otp_expired":
      return copy.otpExpired;
    case "otp_attempts_exceeded":
      return copy.otpAttemptsExceeded;
    case "phone_already_verified":
      return copy.phoneAlreadyVerified;
    case "phone_missing":
      return copy.phoneMissing;
    case "invitation_recipient_mismatch":
      return copy.invitationRecipientMismatch;
  }
  if (error.kind === "not_found" || error.status === 405) return copy.notAvailableYet;
  if (error.kind === "rate_limited") {
    return error.retryAfterSeconds ? copy.waitSeconds(error.retryAfterSeconds) : strings.shared.apiErrors.rateLimited;
  }
  if (error.kind === "validation") return validationMessage(error);
  return friendlyMessage(error);
}

// API validation text may be English (Laravel defaults), so only the failing
// FIELD is read and the copy is always this app's own Spanish.
function validationMessage(error: ApiError): string {
  const copy = strings.access.errors;
  const fields = Object.keys(error.details ?? {});
  if (fields.includes("code")) return copy.otpInvalid;
  if (fields.includes("token")) return copy.otpExpired;
  if (fields.includes("email")) return copy.emailRejected;
  if (fields.includes("phone")) return copy.phoneRejected;
  if (fields.includes("password")) return copy.passwordRejected;
  return copy.checkFields;
}
