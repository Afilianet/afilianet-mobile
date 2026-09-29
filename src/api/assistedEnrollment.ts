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
