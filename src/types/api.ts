// Shapes mirror afilianet-api's Http\Resources classes. Every `id` is the
// resource's `uuid` column, never its internal numeric primary key.
// Money fields (amounts, balances) are decimal strings formatted server-side
// by a Money value object -- never parse them as JS numbers for arithmetic.

// POST /api/v1/auth/login's actual response shape: flat, not wrapped in
// {data: ...} like the resource endpoints below (it isn't a Resource --
// see AuthController::login in afilianet-api).
export interface LoginResponse {
  token: string;
  user: User;
}

// Shape of afilianet-api's paginated resource collections (e.g.
// GET /api/v1/affiliates/{id}/sponsored) -- Laravel's paginator meta.
export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
}

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  status: string;
  timezone: string;
  locale: string;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Only present when the organization was loaded through the auth user's
  // membership pivot, e.g. GET /api/v1/me/organizations.
  my_role?: string;
  my_membership_status?: string;
}

// afilianet-api has no standalone Membership/OrganizationMembership resource --
// role/status arrive as `my_role`/`my_membership_status` fields nested inside
// OrganizationResource. This type models that reality instead of inventing an
// endpoint shape the backend doesn't have.
export interface OrganizationMembership {
  organization: Organization;
  role: string;
  status: string;
}

export function toOrganizationMembership(organization: Organization): OrganizationMembership | null {
  if (!organization.my_role || !organization.my_membership_status) {
    return null;
  }
  return {
    organization,
    role: organization.my_role,
    status: organization.my_membership_status,
  };
}

export interface AffiliateRef {
  id: string;
  affiliate_code: string;
}

export interface AffiliateProfile {
  id: string;
  organization_id?: string;
  user?: { id: string; first_name: string; last_name: string };
  affiliate_code: string;
  status: string;
  sponsor?: AffiliateRef | null;
  placement_parent?: AffiliateRef | null;
  placement_position?: unknown;
  network_depth?: number;
  joined_at: string | null;
  activated_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ComplianceCase {
  id: string;
  organization_id?: string;
  user?: { id: string; first_name: string; last_name: string };
  affiliate?: AffiliateRef | null;
  status: string;
  current_step: string | null;
  risk_level: string | null;
  started_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  // ComplianceStepResource's exact fields weren't inventoried for this phase.
  steps?: unknown[];
  created_at: string;
}

export interface Commission {
  id: string;
  sale?: { id: string } | null;
  beneficiary_affiliate?: AffiliateRef | null;
  source_affiliate?: AffiliateRef | null;
  commission_plan_id?: string | null;
  commission_rule_id?: string | null;
  type: string;
  network_level: number;
  basis_amount: string;
  rate_basis_points: number;
  amount: string;
  currency: string;
  status: string;
  calculated_at: string | null;
  reversed_at: string | null;
  reversal_of?: string | null;
  created_at: string;
}

export interface WalletSummary {
  currency: string;
  status: string;
  pending_balance: string;
  available_balance: string;
}

export interface WalletDetail extends WalletSummary {
  total_credited: string;
  total_debited: string;
  lifetime_earned: string;
}

export interface PayoutDestinationRef {
  id: string;
  display_label: string;
}

export interface Payout {
  id: string;
  destination?: PayoutDestinationRef | null;
  currency: string;
  amount: string;
  status: string;
  requested_at: string | null;
  processing_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
