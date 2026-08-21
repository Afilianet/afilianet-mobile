import { apiRequest } from "./client";
import type {
  AffiliateProfile,
  Commission,
  ComplianceCase,
  LoginResponse,
  Organization,
  PaginatedResponse,
  User,
  WalletSummary,
} from "../types/api";

export async function fetchMe(): Promise<User> {
  const { data } = await apiRequest<{ data: User }>("/api/v1/me");
  return data;
}

export async function fetchMyOrganizations(): Promise<Organization[]> {
  const { data } = await apiRequest<{ data: Organization[] }>("/api/v1/me/organizations");
  return data;
}

export async function fetchMyAffiliateProfile(): Promise<AffiliateProfile> {
  const { data } = await apiRequest<{ data: AffiliateProfile }>("/api/v1/affiliates/me");
  return data;
}

export async function fetchMyWallet(): Promise<WalletSummary[]> {
  const { data } = await apiRequest<{ data: WalletSummary[] }>("/api/v1/wallet");
  return data;
}

export async function fetchMyCommissions(): Promise<Commission[]> {
  const { data } = await apiRequest<{ data: Commission[] }>("/api/v1/commissions/mine");
  return data;
}

export async function fetchMyCompliance(): Promise<ComplianceCase> {
  const { data } = await apiRequest<{ data: ComplianceCase }>("/api/v1/compliance");
  return data;
}

/**
 * A preview of who this affiliate has directly sponsored. There's no
 * dedicated self-scoped endpoint for this -- it's the admin-shaped
 * /affiliates/{affiliate}/sponsored route, which authorizes viewing your
 * own affiliate id, so callers must pass the id from fetchMyAffiliateProfile().
 */
export async function fetchSponsoredAffiliates(
  affiliateId: string,
  perPage = 5,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/${affiliateId}/sponsored?per_page=${perPage}`,
  );
}

export async function signIn(email: string, password: string): Promise<LoginResponse> {
  // Not wrapped in {data: ...} -- see the LoginResponse comment in types/api.ts.
  return apiRequest<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
    skipOrganization: true,
  });
}

/**
 * Best-effort server-side logout. Callers should still clear local session
 * state even if this throws (offline, already-expired token, etc.) -- see
 * AuthProvider.signOut.
 */
export async function signOutRequest(): Promise<void> {
  await apiRequest<{ message: string }>("/api/v1/auth/logout", {
    method: "POST",
    skipOrganization: true,
    skipUnauthorizedHandling: true,
  });
}
