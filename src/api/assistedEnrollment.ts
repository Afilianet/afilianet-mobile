import { apiRequest } from "./client";
import { isApiError } from "./errors";

/**
 * POST /api/v1/affiliates/me/assisted-enrollments (API contract
 * docs/auth/ACCOUNT_ACCESS_CONTRACT.md §7): email, phone or both, at least
 * one -- the same rule as direct registration. `phone` is always E.164
 * (utils/phone.ts). Drafts queued before phone support only carry `email`
 * and remain valid as they are.
 */
export interface AssistedEnrollmentInput {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  client_request_id: string;
  consent_confirmed: true;
}
export interface AssistedEnrollmentResult {
  id: string;
  affiliate_id: string;
  affiliate_code: string;
  first_name: string;
  last_name: string;
  affiliate_status: string;
  access_status: "pending" | "ready";
  created_at: string;
}
export async function createAssistedEnrollment(input: AssistedEnrollmentInput): Promise<AssistedEnrollmentResult> {
  const { data } = await apiRequest<{ data: AssistedEnrollmentResult }>("/api/v1/affiliates/me/assisted-enrollments", {
    method: "POST", body: input,
  });
  return data;
}

export async function fetchAssistedEnrollment(id: string): Promise<AssistedEnrollmentResult> {
  const { data } = await apiRequest<{ data: AssistedEnrollmentResult }>(
    `/api/v1/affiliates/me/assisted-enrollments/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function fetchPendingAssistedEnrollments(page = 1): Promise<{
  data: AssistedEnrollmentResult[];
  meta: { current_page: number; last_page: number };
}> {
  return apiRequest(`/api/v1/affiliates/me/assisted-enrollments?page=${page}`);
}

/** The reason API #92 puts on this route's 404; a reasonless 404 is an older API or a missing route. */
export const ASSISTED_ENROLLMENT_NOT_FOUND = "assisted_enrollment_not_found";

/**
 * GET /api/v1/affiliates/me/assisted-enrollments/by-request/{client_request_id}
 * (API #92): read-only lookup of this sponsor's enrollment in the active
 * organization. Never replays the creation to find out, since a replay can
 * create it. Resolves null only for the route's own "not found"; anything
 * else (timeout, 401/403, 5xx, a reasonless 404) rejects so callers stay
 * uncertain.
 */
export async function lookupAssistedEnrollmentByRequest(clientRequestId: string): Promise<AssistedEnrollmentResult | null> {
  try {
    const { data } = await apiRequest<{ data: AssistedEnrollmentResult }>(
      `/api/v1/affiliates/me/assisted-enrollments/by-request/${encodeURIComponent(clientRequestId)}`,
      { skipUnauthorizedHandling: true },
    );
    return data;
  } catch (error) {
    if (isApiError(error) && error.status === 404 && error.reason === ASSISTED_ENROLLMENT_NOT_FOUND) return null;
    throw error;
  }
}
