import { apiRequest } from "./client";

export interface AssistedEnrollmentInput {
  first_name: string;
  last_name: string;
  email: string;
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
