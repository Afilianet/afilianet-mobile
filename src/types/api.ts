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
  // Absent (not null) from GET /affiliates/me/sponsor and
  // /affiliates/me/placement-parent's responses -- those endpoints only
  // eager-load organization+user on the returned profile, not its own
  // sponsor/placementParent relations.
  sponsor?: AffiliateRef | null;
  placement_parent?: AffiliateRef | null;
  placement_position?: unknown;
  network_depth?: number;
  joined_at: string | null;
  activated_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// SponsoredInvitationResource (GET /api/v1/affiliates/me/invitations) --
// deliberately excludes full email/phone, organization, sponsor, invited_by,
// and the token/hash. `status` is already the backend's *effective* status
// (a stored "pending" row past expires_at is reported as "expired" here).
export interface Invitation {
  id: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  masked_email: string | null;
  masked_phone: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
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
  network_level: number | null;
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

// LedgerEntryResource (GET /api/v1/wallet/{currency}/entries) -- one row
// per ledger transaction backing a wallet's balance. `status` is already
// the backend's *effective* status (a stored "pending" row whose
// available_at has passed reports as "available" here, same pattern as
// Invitation's effective status). `source_type` is a short class basename
// only (e.g. "Commission") -- the backend deliberately never exposes the
// source row's id here.
export interface LedgerEntry {
  id: string;
  type: "commission" | "commission_reversal" | "adjustment_credit" | "adjustment_debit" | "payout" | "payout_reversal";
  status: string;
  amount: string;
  currency: string;
  available_at: string | null;
  effective_at: string;
  source_type: string | null;
  is_reversal: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PayoutDestinationRef {
  id: string;
  display_label: string;
}

export type PayoutStatus = "requested" | "processing" | "paid" | "failed" | "cancelled";

// PayoutResource (GET /api/v1/payouts, /payouts/mine, /payouts/{uuid}) --
// deliberately excludes provider_reference (never established as safe to
// expose). `destination` is always eager-loaded by every controller action
// that returns a Payout, so it's null only when the destination itself was
// deleted, never simply "not loaded".
export interface Payout {
  id: string;
  destination?: PayoutDestinationRef | null;
  currency: string;
  amount: string;
  status: PayoutStatus;
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

// PayoutDestinationResource (GET/POST/PATCH /api/v1/payout-destinations) --
// deliberately excludes provider_reference (an opaque provider-side token
// that must never be exposed publicly). There is no raw bank/account
// number anywhere in this model to begin with -- see PayoutDestination's
// own docblock in afilianet-api. Destination creation today is real but
// self-attested: no payment-provider tokenization flow exists yet, so
// `provider`/`display_label` are whatever the client sends, not verified
// against a real bank.
export interface PayoutDestination {
  id: string;
  type: "bank_account" | "provider_account";
  currency: string | null;
  country: string;
  provider: string | null;
  display_label: string;
  status: "active" | "inactive";
  verified_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// PayoutEligibilityResource (GET /api/v1/wallet/{currency}/payout-eligibility)
// -- a computed figure, not a stored row. eligible_balance is already
// available_balance - outstanding_reservations - reserve, calculated
// server-side; never re-derive this client-side. `reserve` is currently
// always "0" (no reserve-percentage feature configured/exposed yet in
// afilianet-api) but is still real backend output, not invented.
export interface PayoutEligibility {
  currency: string;
  available_balance: string;
  outstanding_reservations: string;
  reserve: string;
  eligible_balance: string;
  minimum_payout: string;
}
