import { apiRequest } from "./client";
import type {
  AffiliateProfile,
  Commission,
  ComplianceCase,
  Invitation,
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
 * A preview of who this affiliate has directly sponsored, via the
 * /affiliates/{affiliate}/sponsored route (policy-gated to your own
 * affiliate id, or another affiliate's id if you're viewing them -- see
 * fetchAffiliateSponsored below, same endpoint shape). `page` defaults to 1
 * so Home's existing preview call site (which never passes it) is unaffected.
 */
export async function fetchSponsoredAffiliates(
  affiliateId: string,
  perPage = 5,
  page = 1,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/${affiliateId}/sponsored?per_page=${perPage}&page=${page}`,
  );
}

// GET /affiliates/me/sponsor -- {data: null} if the affiliate has no
// sponsor (root of the tree), not a 404.
export async function fetchMySponsor(): Promise<AffiliateProfile | null> {
  const { data } = await apiRequest<{ data: AffiliateProfile | null }>("/api/v1/affiliates/me/sponsor");
  return data;
}

// GET /affiliates/me/placement-parent -- same {data: null}-for-root shape
// as fetchMySponsor. Sponsor and placement parent are independent
// relationships in this domain and are never assumed equal.
export async function fetchMyPlacementParent(): Promise<AffiliateProfile | null> {
  const { data } = await apiRequest<{ data: AffiliateProfile | null }>("/api/v1/affiliates/me/placement-parent");
  return data;
}

export async function fetchMySponsored(
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/me/sponsored?per_page=${perPage}&page=${page}`,
  );
}

export async function fetchMyPlacementChildren(
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/me/placement-children?per_page=${perPage}&page=${page}`,
  );
}

/**
 * Invitations this affiliate personally sponsored (created from their own
 * referral link) -- not invitations addressed to them. `status` is already
 * effective (expired-but-stored-as-pending rows report as "expired").
 */
export async function fetchMyInvitations(perPage = 10): Promise<PaginatedResponse<Invitation>> {
  return apiRequest<PaginatedResponse<Invitation>>(`/api/v1/affiliates/me/invitations?per_page=${perPage}`);
}

/**
 * Drill-down into a specific affiliate's profile. Per afilianet-api's
 * AffiliateProfilePolicy::view, a plain affiliate can only legally view
 * their OWN id here -- not even their direct downline. Being sponsored-by
 * or a sponsor-of someone grants no extra visibility. Org owner/admin/
 * manager roles can view any affiliate in their organization. Expect and
 * handle a 403 for the common case (a plain affiliate tapping into someone
 * else's row) -- that's the backend working as designed, not a bug.
 */
export async function fetchAffiliateDetails(affiliateId: string): Promise<AffiliateProfile> {
  const { data } = await apiRequest<{ data: AffiliateProfile }>(`/api/v1/affiliates/${affiliateId}`);
  return data;
}

/** Same endpoint/shape as fetchSponsoredAffiliates -- named separately for the drill-down call sites' clarity. */
export async function fetchAffiliateSponsored(
  affiliateId: string,
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/${affiliateId}/sponsored?per_page=${perPage}&page=${page}`,
  );
}

export async function fetchAffiliatePlacementChildren(
  affiliateId: string,
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<AffiliateProfile>> {
  return apiRequest<PaginatedResponse<AffiliateProfile>>(
    `/api/v1/affiliates/${affiliateId}/placement-children?per_page=${perPage}&page=${page}`,
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
