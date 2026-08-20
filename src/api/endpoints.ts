import { apiRequest } from "./client";
import type { AffiliateProfile, Commission, ComplianceCase, Organization, User, WalletSummary } from "../types/api";

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

export interface SignInResult {
  user: User;
  token: string;
}

/**
 * Calls the login endpoint afilianet-api is expected to expose, but does not
 * yet: POST /api/v1/auth/login. The Authentication module in the backend is
 * currently an empty stub, so this will fail with a 404 (or network error if
 * the route doesn't even resolve) until that work lands. See README.md
 * "Known limitation" for the workaround used during this phase.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data } = await apiRequest<{ data: SignInResult }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
    skipOrganization: true,
  });
  return data;
}
