import { apiRequest } from "./client";

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
