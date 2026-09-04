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

// app/Modules/Identity/Enums/VerificationProvider.php.
export type VerificationProvider = "fake" | "afilianet" | "incode" | "aws_rekognition";

// ComplianceProviderResolver::describe()'s closed, safe reason-code set
// (Phase 9C.2a) -- never a raw exception message, config key, URL, or
// credential. See ProviderAvailability's docblock in afilianet-api.
export type ProviderUnavailableReason =
  | "not_configured"
  | "provider_misconfigured"
  | "provider_not_implemented"
  | "engine_unavailable";

// ComplianceStepResource -- deliberately omits provider_reference (a
// vendor-specific reference, never safe to expose). `provider` (a plain
// label like "fake-identity") is explicitly safe per the resource's own
// docblock. attempt_count/score/completed_at always reflect the latest
// attempt only -- `provider` itself is null until a first attempt exists.
//
// `configured_provider`/`provider_actionable`/`provider_unavailable_reason`
// (Phase 9C.2a) are a SEPARATE, server-authoritative signal -- never
// inferred from attempts, available BEFORE any attempt exists. This is what
// mobile must use to decide whether to even show the Afilianet capture flow
// -- never `provider` above, and never a client-side guess.
export interface ComplianceStep {
  id: string;
  step_type: ComplianceStepType;
  status: ComplianceStepStatus;
  provider: string | null;
  score: number | null;
  attempt_count: number;
  completed_at: string | null;
  created_at: string;
  configured_provider: VerificationProvider | null;
  provider_actionable: boolean;
  provider_unavailable_reason: ProviderUnavailableReason | null;
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

// app/Modules/Identity/Enums/EvidenceType.php -- mobile only ever submits
// the identity_document capture types (Phase 9C.2) and `selfie` (Phase
// 9D.3, the face-match probe image); the other cases exist server-side for
// liveness/consent evidence, not built on mobile yet.
export type EvidenceType = "id_document_front" | "id_document_back" | "id_document_page" | "selfie";

// app/Modules/Identity/Enums/EvidenceStatus.php (Phase 9B).
export type EvidenceStatus = "pending_upload" | "uploaded" | "rejected" | "expired";

// EvidenceResource -- deliberately excludes storage_provider/storage_key/
// sha256_hash (never safe to expose -- the client already knows what it
// uploaded). `provider` is a plain vendor label, safe to show.
export interface Evidence {
  id: string;
  type: EvidenceType;
  status: EvidenceStatus;
  provider: string | null;
  mime_type: string;
  size: number;
  captured_at: string | null;
  retention_until: string | null;
  created_at: string;
}

// EvidenceUploadAuthorizationResource -- the response to POST
// .../evidence/uploads. `upload.url`/`headers` are echoed back verbatim on
// the direct PUT -- never a bucket name, object key, or AWS credentials.
// The client must treat this the same whether it's a real S3 presigned URL
// or the local-dev signed-route stand-in.
export interface EvidenceUploadAuthorization {
  evidence: Evidence;
  upload: {
    url: string;
    method: string;
    headers: Record<string, string>;
    expires_at: string;
  };
}

// app/Modules/Identity/Enums/DocumentType.php -- the only two document
// types afilianet-api has a real parser for. Client-declared intent at
// trigger time, never a verification outcome.
export type DocumentType = "mx_ine" | "passport";

// app/Modules/Identity/Enums/DocumentProcessingStatus.php -- the lifecycle
// of one processing ATTEMPT, deliberately distinct from both EvidenceStatus
// and ComplianceStepStatus (see DocumentProcessingResult below).
export type DocumentProcessingStatus = "pending" | "processing" | "completed" | "failed";

// app/Modules/Identity/Enums/DocumentVerdict.php -- only set when status is
// "completed". Maps to ComplianceStep.status server-side (pass/review both
// -> step "passed", review additionally routes the CASE to manual_review;
// fail -> step "failed", retryable) -- mobile never re-derives this mapping
// itself, only reads back what the step/case already show.
export type DocumentVerdict = "pass" | "review" | "fail";

// App\Modules\Identity\Documents\ExtractedField -- one normalized value OCR
// found, never a raw OCR fragment. `value` is null-able in principle but a
// field is only ever included here when something was actually found.
export interface ExtractedField {
  name: string;
  value: string | null;
  confidence: number;
  confirmation_required: boolean;
}

// The mobile-facing lifecycle of confirmation for one result (Phase 9C.2a) --
// "not_required" (nothing confirmable was extracted), "pending" (confirmable
// fields exist, not yet confirmed), "confirmed" (confirmed_fields is set).
// Server-computed -- never inferred client-side from confidence/verdict.
export type DocumentConfirmationStatus = "not_required" | "pending" | "confirmed";

// DocumentProcessingResultResource -- deliberately excludes raw OCR text,
// storage keys/provider. `validation_checks`/`quality` exist server-side but
// are intentionally not modeled here -- mobile never renders raw check
// names/processor internals, only the normalized verdict/confidence/
// failure_reason.
//
// `confirmed_fields`/`confirmation_required`/`confirmation_status`
// (Phase 9C.2a) are strictly separate from `extracted_fields` -- confirming
// NEVER rewrites extracted_fields (the original OCR output stays intact for
// history/audit); `confirmed_fields` is null until the owning affiliate
// confirms via PATCH .../document-result. A field name present in
// `confirmed_fields` is not necessarily present in `extracted_fields`'s
// current render order, but in practice both key sets match exactly (see
// DocumentConfirmableFields in afilianet-api).
export interface DocumentProcessingResult {
  id: string;
  document_type: DocumentType;
  status: DocumentProcessingStatus;
  verdict: DocumentVerdict | null;
  confidence: number | null;
  extracted_fields: ExtractedField[];
  confirmed_fields: Record<string, string> | null;
  confirmation_required: boolean;
  confirmation_status: DocumentConfirmationStatus;
  failure_reason: string | null;
  processor_version: string;
  attempt_number: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// app/Modules/Identity/Enums/FaceMatchStatus.php -- the lifecycle of one
// face-match processing ATTEMPT, deliberately independent of
// ComplianceStepStatus (same three-lifecycle discipline as
// DocumentProcessingStatus): a `completed` attempt is a statement about the
// ENGINE CALL running end-to-end, not about whether the faces match --
// `completed` can still carry verdict `no_match`.
export type FaceMatchStatus = "pending" | "processing" | "completed" | "failed";

// app/Modules/Identity/Enums/FaceMatchVerdict.php -- only set when status is
// "completed". `match`/`review` both map server-side to ComplianceStep
// `passed` (review additionally routes the CASE to manual_review);
// `no_match` maps to `failed`, retryable via the normal attempt mechanism.
// Mobile never re-derives this mapping, only reads back what the step/case
// already show. A `match` verdict says ONLY "the selfie appears
// sufficiently similar to the document portrait" -- never liveness, never
// government identity verification, never fraud-ruled-out -- see
// faceMatchCopy.ts's verdict copy for the exact wording this drives.
export type FaceMatchVerdict = "match" | "review" | "no_match";

// FaceMatchProcessingResultResource -- deliberately excludes
// similarity/distance/threshold/review_band (raw biometric comparison
// internals, never surfaced to a normal production mobile client per this
// phase's brief) and engine/model/reference_evidence_id/probe_evidence_id
// (internal technical detail). `failure_reason` IS included -- technical-
// only, never PII/biometric content, same category as
// DocumentProcessingResult's own `failure_reason`. Distinguishes PROBE
// (selfie) vs REFERENCE (document-portrait) failures by an exact `_probe`/
// `_reference` suffix convention (see faceMatchCopy.ts).
export interface FaceMatchProcessingResult {
  id: string;
  status: FaceMatchStatus;
  verdict: FaceMatchVerdict | null;
  failure_reason: string | null;
  attempt_number: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// app/Modules/Identity/Enums/LivenessSessionStatus.php -- a session's own
// lifecycle, independent of ComplianceStepStatus (same three-lifecycle
// discipline as document/face-match). Only "completed"/"failed" are
// terminal (isTerminal() server-side) -- "completed" is a statement about
// the AWS pipeline running end-to-end, not about the verdict (a completed
// session can still carry verdict "not_live").
export type LivenessSessionStatus = "pending" | "processing" | "completed" | "failed";

// app/Modules/Identity/Enums/LivenessVerdict.php -- only ever set when
// status is "completed". "live"/"review" both map server-side to
// ComplianceStep `passed` (review additionally routes the CASE to
// manual_review, same mechanism document/face-match review already uses);
// "not_live" maps to `failed`, retryable via the normal attempt mechanism,
// with no backend-enforced max-attempts limit. A "live" verdict says ONLY
// "a real person appears to be present" -- never identity verification,
// never document verification, never fraud-proofing, and never combined
// with Face Match's own separate verdict -- see livenessCopy.ts.
export type LivenessVerdict = "live" | "review" | "not_live";

// LivenessSessionResource -- deliberately excludes AWS's own SessionId
// under any raw/internal name (this `session_id` IS AWS's SessionId, safe
// to expose as an opaque correlation value only), confidence/threshold,
// and any reference/audit image data (the backend requests zero AWS audit
// images at session-creation time and never persists them -- see
// AWS_FACE_LIVENESS.md). `failure_reason` is a closed, technical-only set
// (see livenessCopy.ts) -- a technical failure is never presented as
// "not_live". `expires_at` is the backend's OWN locally-enforced ~3-minute
// session TTL (mirrors AWS's documented session lifetime but is checked
// server-side without calling AWS again) -- mobile treats a locally
// expired/terminal-failed session as "needs a brand new session", never
// retries the same session_id.
export interface LivenessSession {
  id: string;
  session_id: string;
  region: string;
  status: LivenessSessionStatus;
  verdict: LivenessVerdict | null;
  failure_reason: string | null;
  attempt_number: number;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// LivenessCredentialsResource -- temporary AWS STS credentials, MINTED
// FRESH on every successful call (no per-session cap, only a tight 10/min
// rate limit) and never cached/persisted anywhere client-side -- see
// useLivenessCredentials.ts's docblock for the full in-memory-only
// discipline this type's values must follow. Snake_case exactly as the
// backend returns it; mapping to the AWS native SDK's expected camelCase
// shape happens at the native-module boundary only (see
// modules/aws-face-liveness), never persisted in that camelCase form
// either.
export interface LivenessCredentials {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  expiration: string;
  session_id: string;
  region: string;
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
