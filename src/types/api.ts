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

// app/Modules/Identity/Enums/ComplianceStatus.php. "not_started" is never
// actually returned by the backend (a case doesn't exist until POST
// .../start is called) -- it's synthesized client-side when GET
// /api/v1/compliance 404s. Computed server-side via
// ComplianceCase::effectiveStatus() (past expires_at on a non-terminal
// case reports as "expired" here, not enforced by any scheduled job).
export type ComplianceStatus =
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "manual_review"
  | "approved"
  | "rejected"
  | "expired";

// app/Modules/Identity/Enums/ComplianceStepType.php. Which of these six
// exist for a given case is organization-configured
// (Organization::requiredComplianceSteps(), default is
// [identity_document, terms_acceptance]) -- never assume a case has all six.
export type ComplianceStepType =
  | "identity_information"
  | "identity_document"
  | "biometric_liveness"
  | "face_match"
  | "verbal_consent"
  | "terms_acceptance";

// app/Modules/Identity/Enums/ComplianceStepStatus.php. "in_progress" and
// "manual_review" are declared server-side but never actually reachable
// from current backend code paths (ComplianceService only ever sets
// pending/passed/failed) -- kept here for type completeness, not because
// the mobile app expects to see them today.
export type ComplianceStepStatus = "pending" | "in_progress" | "passed" | "failed" | "manual_review" | "skipped";

// ComplianceStepResource -- deliberately omits provider_reference (a
// vendor-specific reference, never safe to expose). `provider` (a plain
// label like "fake-identity") is explicitly safe per the resource's own
// docblock. attempt_count/score/completed_at always reflect the latest
// attempt only.
export interface ComplianceStep {
  id: string;
  step_type: ComplianceStepType;
  status: ComplianceStepStatus;
  provider: string | null;
  score: number | null;
  attempt_count: number;
  completed_at: string | null;
  created_at: string;
}

// ComplianceCaseResource -- deliberately excludes `metadata` (may carry
// provider-adjacent detail not meant for API consumers).
export interface ComplianceCase {
  id: string;
  organization_id?: string;
  user?: { id: string; first_name: string; last_name: string };
  affiliate?: AffiliateRef | null;
  status: ComplianceStatus;
  current_step: ComplianceStepType | null;
  risk_level: string | null;
  started_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  steps?: ComplianceStep[];
  created_at: string;
}

// POST /api/v1/compliance/steps/{step}/attempt's body, exactly matching
// AttemptComplianceStepRequest's per-step-type validation rules --
// identity_information takes no fields at all (the request must be empty).
// `outcome`/`score` only ever exercise afilianet-api's Fake verification
// providers (no real vendor integrated) -- never presented to a real user
// as a genuine verification action, see DevelopmentStepSimulator.
export type AttemptStepPayload = { accepted: boolean } | { outcome: "pass" | "fail"; score?: number } | Record<string, never>;

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

// app/Modules/Notifications/Enums/NotificationType.php -- a deliberately
// closed enum (a type is only ever added alongside the listener that
// creates it). Never assume a 15th type; an unrecognized value must fail
// safely (no icon/label/navigation) rather than guessed at.
export type NotificationType =
  | "compliance_started"
  | "compliance_action_required"
  | "compliance_manual_review"
  | "compliance_approved"
  | "compliance_rejected"
  | "affiliate_activated"
  | "invitation_accepted"
  | "commission_earned"
  | "commission_reversed"
  | "payout_requested"
  | "payout_processing"
  | "payout_paid"
  | "payout_failed"
  | "payout_cancelled";

// The exact, whitelisted keys NotificationResource's listeners ever put in
// `payload` (app/Modules/Notifications/Listeners/Notify*.php) -- `screen` is
// a short label ("compliance"/"profile"/"network"/"commissions"/"payouts"),
// never a route or URL, and must still be validated against an explicit
// whitelist before use (see notificationDestination.ts) rather than trusted
// directly. `amount`/`currency` are the one deliberate case of transaction
// data in payload -- the affiliate's own single commission/payout, already
// server-rendered into `title`/`body` too, never an aggregate balance.
export interface NotificationPayload {
  screen?: string;
  case_id?: string;
  step_type?: string;
  commission_id?: string;
  payout_id?: string;
  amount?: string;
  currency?: string;
}

// NotificationResource -- deliberately named `payload`, not `data`: a
// `data` key would collide with Laravel's single-resource response
// wrapping and silently un-wrap POST .../read's envelope (confirmed via
// the resource's own docblock in afilianet-api, caught by that module's
// own HTTP tests). `title`/`body` are server-rendered, authoritative
// display copy for every type -- never reconstructed client-side.
// `read_at` (not a boolean `is_read`) is the only read-state field: null
// means unread.
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
}
