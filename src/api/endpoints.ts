import { apiRequest } from "./client";
import type {
  AffiliateProfile,
  AttemptStepPayload,
  Commission,
  ComplianceCase,
  ComplianceStep,
  DocumentProcessingResult,
  DocumentType,
  Evidence,
  EvidenceType,
  EvidenceUploadAuthorization,
  FaceMatchProcessingResult,
  Invitation,
  LedgerEntry,
  LivenessCredentials,
  LivenessSession,
  LoginResponse,
  Notification,
  Organization,
  PaginatedResponse,
  Payout,
  PayoutDestination,
  PayoutEligibility,
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

/**
 * /commissions/mine is actually paginated server-side (page 1, 25/page by
 * default) -- this just reads the first page's `data` array for Home's
 * "recent 5" preview, which never needed more than that. For the full,
 * paginated Commissions screen, use fetchMyCommissionsPage below instead of
 * changing this function's shape (Home's existing consumer expects a flat
 * array, not a {data,meta} envelope).
 */
export async function fetchMyCommissions(): Promise<Commission[]> {
  const { data } = await apiRequest<{ data: Commission[] }>("/api/v1/commissions/mine");
  return data;
}

export async function fetchMyCommissionsPage(
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<Commission>> {
  return apiRequest<PaginatedResponse<Commission>>(
    `/api/v1/commissions/mine?per_page=${perPage}&page=${page}`,
  );
}

/**
 * Self-scoped ledger activity for one currency (GET /wallet/{currency}/entries).
 * Currency-scoped deliberately, never combined -- an affiliate's balances
 * are always separate per currency, and so is their activity history.
 */
export async function fetchWalletActivity(
  currency: string,
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<LedgerEntry>> {
  return apiRequest<PaginatedResponse<LedgerEntry>>(
    `/api/v1/wallet/${currency}/entries?per_page=${perPage}&page=${page}`,
  );
}

export async function fetchMyCompliance(): Promise<ComplianceCase> {
  const { data } = await apiRequest<{ data: ComplianceCase }>("/api/v1/compliance");
  return data;
}

/**
 * POST /api/v1/compliance/start -- no request body. Creates the case plus
 * one ComplianceStep row per organization-configured required step type.
 * 422 if this affiliate already has an active case -- there is no
 * idempotent "get or create" here, so callers should only reach this from
 * the not-started empty state.
 */
export async function startCompliance(): Promise<ComplianceCase> {
  const { data } = await apiRequest<{ data: ComplianceCase }>("/api/v1/compliance/start", {
    method: "POST",
  });
  return data;
}

/** GET /api/v1/compliance/steps -- the affiliate's own required steps for their latest case. */
export async function fetchComplianceSteps(): Promise<ComplianceStep[]> {
  const { data } = await apiRequest<{ data: ComplianceStep[] }>("/api/v1/compliance/steps");
  return data;
}

/**
 * POST /api/v1/compliance/steps/{step}/attempt -- rate-limited server-side
 * (30/minute per user). Returns the full case (steps included), not just
 * the attempted step, so callers can refresh everything from one response.
 * Backend alone decides pass/fail, the case's next status (including
 * manual_review/approved), and whether the affiliate activates -- this app
 * never infers any of that client-side, only reads back what's returned.
 * `outcome`/`score` only ever exercise afilianet-api's Fake verification
 * providers; see DevelopmentStepSimulator for the only place that's meant
 * to be reachable from.
 */
export async function attemptComplianceStep(stepId: string, payload: AttemptStepPayload): Promise<ComplianceCase> {
  const { data } = await apiRequest<{ data: ComplianceCase }>(`/api/v1/compliance/steps/${stepId}/attempt`, {
    method: "POST",
    body: payload,
  });
  return data;
}

/**
 * Phase 9B evidence upload-session flow, step 1: authorizes one upload for
 * one step. Never sends the binary here -- only intent (type/mime/size).
 * The response's `upload.url` is echoed back verbatim on a direct PUT (see
 * useDocumentCapture.ts), treated identically whether it's a real S3
 * presigned URL or the local-dev signed-route stand-in -- this function
 * never special-cases either.
 */
export async function requestEvidenceUpload(
  stepId: string,
  params: { evidence_type: EvidenceType; mime_type: string; size: number },
): Promise<EvidenceUploadAuthorization> {
  const { data } = await apiRequest<{ data: EvidenceUploadAuthorization }>(
    `/api/v1/compliance/steps/${stepId}/evidence/uploads`,
    { method: "POST", body: params },
  );
  return data;
}

/** Phase 9B evidence upload-session flow, step 3 (after the direct PUT in step 2): confirms the object actually landed. */
export async function completeEvidenceUpload(evidenceId: string): Promise<Evidence> {
  const { data } = await apiRequest<{ data: Evidence }>(`/api/v1/compliance/evidence/${evidenceId}/complete`, {
    method: "POST",
    body: {},
  });
  return data;
}

/**
 * Phase 9C.1's Afilianet Document Engine: triggers an async processing
 * attempt for the identity_document step. `document_type` is
 * client-declared intent (which parser to run), never a verification
 * outcome -- there is no `outcome`/`score` field here, unlike
 * attemptComplianceStep's Fake-provider-only payload. Returns 202
 * immediately (a `pending` DocumentProcessingResult) -- the real outcome is
 * only ever read back via fetchDocumentResult's polling.
 */
export async function triggerDocumentProcessing(
  stepId: string,
  documentType: DocumentType,
): Promise<DocumentProcessingResult> {
  const { data } = await apiRequest<{ data: DocumentProcessingResult }>(
    `/api/v1/compliance/steps/${stepId}/document-processing`,
    { method: "POST", body: { document_type: documentType } },
  );
  return data;
}

/**
 * The latest document-processing attempt for a step. 404s
 * (`DocumentProcessingException::noResultYet()`) when processing has never
 * been triggered for this step -- callers should treat that as "no result
 * yet", not a hard error (see useDocumentResult.ts).
 */
export async function fetchDocumentResult(stepId: string): Promise<DocumentProcessingResult> {
  const { data } = await apiRequest<{ data: DocumentProcessingResult }>(
    `/api/v1/compliance/steps/${stepId}/document-result`,
  );
  return data;
}

/**
 * Phase 9C.2a: confirms/corrects the extracted fields on the step's latest
 * COMPLETED document-processing result -- PATCH .../document-result,
 * `{"fields": {...}}` exactly matching ConfirmDocumentResultRequest's
 * accepted shape (afilianet-api). `fields` must be exactly the confirmable
 * field set for this result (all-or-nothing) -- callers should derive it
 * from the result's own `extracted_fields`, never invent a broader schema.
 * Never touches ComplianceStep/ComplianceCase state server-side. A repeated
 * IDENTICAL submission is a safe no-op; a repeated DIFFERENT submission
 * after confirmation returns 409 (see useConfirmDocumentResult.ts).
 */
export async function confirmDocumentResult(
  stepId: string,
  fields: Record<string, string>,
): Promise<DocumentProcessingResult> {
  const { data } = await apiRequest<{ data: DocumentProcessingResult }>(
    `/api/v1/compliance/steps/${stepId}/document-result`,
    { method: "PATCH", body: { fields } },
  );
  return data;
}

/**
 * Phase 9D.2's Afilianet Face Match: triggers an async processing attempt
 * for the face_match step. No request body -- unlike triggerDocumentProcessing,
 * there is no client-declared intent field at all (TriggerFaceMatchProcessingRequest
 * prohibits `outcome`/`score` and accepts nothing else); which evidence
 * feeds the comparison is resolved entirely server-side (the case's latest
 * uploaded `selfie` evidence as the probe, and the portrait evidence type
 * from the case's latest completed identity_document result as the
 * reference). Returns 202 immediately (a `pending` FaceMatchProcessingResult) --
 * the real outcome is only ever read back via fetchFaceMatchResult's polling.
 */
export async function triggerFaceMatchProcessing(stepId: string): Promise<FaceMatchProcessingResult> {
  const { data } = await apiRequest<{ data: FaceMatchProcessingResult }>(
    `/api/v1/compliance/steps/${stepId}/face-match-processing`,
    { method: "POST", body: {} },
  );
  return data;
}

/**
 * The latest face-match processing attempt for a step. 404s
 * (`FaceMatchProcessingException::noResultYet()`) when processing has never
 * been triggered for this step -- callers should treat that as "no result
 * yet", not a hard error (see useFaceMatchResult.ts).
 */
export async function fetchFaceMatchResult(stepId: string): Promise<FaceMatchProcessingResult> {
  const { data } = await apiRequest<{ data: FaceMatchProcessingResult }>(
    `/api/v1/compliance/steps/${stepId}/face-match-result`,
  );
  return data;
}

/**
 * Phase 9E.2's AWS Rekognition Face Liveness: creates (or reuses, per the
 * backend's own idempotency rule -- non-terminal AND not yet locally
 * expired) a liveness session for the biometric_liveness step. No request
 * body -- CreateLivenessSessionRequest prohibits any client-declared
 * outcome/score field, mirroring triggerFaceMatchProcessing's "server
 * decides everything" contract. Returns 202 with the session itself (never
 * generated/echoed locally) -- `session_id` is AWS's own SessionId, `region`
 * is where the AWS session lives, both required by the native capture
 * component.
 */
export async function createLivenessSession(stepId: string): Promise<LivenessSession> {
  const { data } = await apiRequest<{ data: LivenessSession }>(`/api/v1/compliance/steps/${stepId}/liveness-session`, {
    method: "POST",
    body: {},
  });
  return data;
}

/**
 * Mints a FRESH set of temporary AWS STS credentials for the step's latest
 * liveness session -- no request body (the backend always operates on its
 * own `latestSession($step)`, never a client-supplied session id), no
 * per-session cap (only a tight 10/min rate limit distinct from every other
 * liveness/processing endpoint). Every successful call is a genuinely new
 * STS AssumeRole -- never call this speculatively or cache its result
 * beyond one capture attempt (see useLivenessCredentials.ts).
 */
export async function fetchLivenessCredentials(stepId: string): Promise<LivenessCredentials> {
  const { data } = await apiRequest<{ data: LivenessCredentials }>(
    `/api/v1/compliance/steps/${stepId}/liveness-session/credentials`,
    { method: "POST", body: {} },
  );
  return data;
}

/**
 * The latest liveness session's current state. 404 means no session has
 * ever been created for this step (never triggered yet) -- distinct from a
 * session existing but not yet terminal (200 with status "pending"/
 * "processing"). Same LivenessSession shape as createLivenessSession's
 * response (one resource, two entry points).
 */
export async function fetchLivenessResult(stepId: string): Promise<LivenessSession> {
  const { data } = await apiRequest<{ data: LivenessSession }>(`/api/v1/compliance/steps/${stepId}/liveness-result`);
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
 * AffiliateProfilePolicy::view, a plain affiliate can view: themselves, any
 * org owner/admin/manager can view anyone, and (as of the downline
 * visibility fix) an affiliate can view anyone who is their descendant via
 * EITHER the sponsor tree or the placement tree, at any depth -- not just
 * direct children. Siblings, cousins, unrelated same-org affiliates, and
 * ancestors (the reverse direction) still 403. Callers should still handle
 * 403 as a clean, expected outcome rather than a generic failure -- it's a
 * real, reachable case (tapping into someone outside your downline), just
 * no longer the default outcome for tapping your own direct-sponsored/
 * placement-children rows.
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

/**
 * GET /api/v1/payouts -- shared with org managers at the API level (a
 * manager sees every payout in the org), but the mobile app only ever acts
 * as the affiliate, and the backend automatically scopes a plain affiliate
 * to their own payouts server-side (no separate "/mine" route exists by
 * design -- see PayoutPolicy's docblock in afilianet-api).
 */
export async function fetchMyPayouts(page = 1, perPage = 20): Promise<PaginatedResponse<Payout>> {
  return apiRequest<PaginatedResponse<Payout>>(`/api/v1/payouts?per_page=${perPage}&page=${page}`);
}

export async function fetchPayoutDestinations(page = 1, perPage = 20): Promise<PaginatedResponse<PayoutDestination>> {
  return apiRequest<PaginatedResponse<PayoutDestination>>(
    `/api/v1/payout-destinations?per_page=${perPage}&page=${page}`,
  );
}

/**
 * Real, callable endpoint today -- but destination creation is currently
 * self-attested (no payment-provider tokenization flow exists yet in
 * afilianet-api). Deliberately does NOT accept a `provider_reference` field
 * from this app: exposing a free-text "bank reference" input would invite
 * users to paste real account/CLABE data into a field with no secure vault
 * behind it. Only fields with no raw-banking-data risk are sent.
 */
export async function createPayoutDestination(input: {
  type: "bank_account" | "provider_account";
  country: string;
  display_label: string;
  currency?: string;
}): Promise<PayoutDestination> {
  const { data } = await apiRequest<{ data: PayoutDestination }>("/api/v1/payout-destinations", {
    method: "POST",
    body: input,
  });
  return data;
}

/**
 * GET /api/v1/wallet/{currency}/payout-eligibility -- the backend's own
 * computed eligible_balance (available_balance - outstanding reservations
 * - reserve). Never re-derive this client-side from wallet + payout history;
 * use exactly what this endpoint returns.
 */
export async function fetchPayoutEligibility(currency: string): Promise<PayoutEligibility> {
  const { data } = await apiRequest<{ data: PayoutEligibility }>(`/api/v1/wallet/${currency}/payout-eligibility`);
  return data;
}

/**
 * POST /api/v1/payouts. `amount_minor` is an integer minor-units value,
 * not a decimal string -- see money.ts's parseAmountInput/toMinorUnits.
 * `idempotency_key` is optional server-side (it auto-generates one if
 * omitted), but that only protects the SERVER from an internal double-post
 * -- it does nothing for a client-side retry unless the client sends its
 * OWN key and reuses it across retries of the same logical attempt, which
 * is exactly what useRequestPayout does.
 */
export async function requestPayout(input: {
  payout_destination_id: string;
  currency: string;
  amount_minor: number;
  idempotency_key: string;
}): Promise<Payout> {
  const { data } = await apiRequest<{ data: Payout }>("/api/v1/payouts", {
    method: "POST",
    body: input,
  });
  return data;
}

/**
 * POST /api/v1/payouts/{payout}/cancel -- no request body. Only ever valid
 * while the payout is still "requested" (PayoutService::cancelPayout()
 * enforces this server-side, via PayoutPolicy's self-affiliate-or-manager
 * `cancel` ability plus the state machine itself); an already-transitioned
 * payout renders as a clean 422, not something this client checks first.
 */
export async function cancelPayout(payoutId: string): Promise<Payout> {
  const { data } = await apiRequest<{ data: Payout }>(`/api/v1/payouts/${payoutId}/cancel`, {
    method: "POST",
  });
  return data;
}

/** GET /api/v1/notifications -- self-scoped, newest first, standard Laravel paginator (per_page default 25, capped at 100). */
export async function fetchNotifications(page = 1, perPage = 25): Promise<PaginatedResponse<Notification>> {
  return apiRequest<PaginatedResponse<Notification>>(`/api/v1/notifications?per_page=${perPage}&page=${page}`);
}

/**
 * GET /api/v1/notifications/unread-count -- exact response shape is
 * `{"data": {"count": N}}` (not a bare number, not `{count: N}` alone) --
 * confirmed against afilianet-api's NotificationController::unreadCount().
 * Always the backend's own count, never derived by summing loaded pages.
 */
export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data } = await apiRequest<{ data: { count: number } }>("/api/v1/notifications/unread-count");
  return data.count;
}

/**
 * POST /api/v1/notifications/{uuid}/read -- idempotent server-side
 * (NotificationService::markAsRead() only writes read_at if still null),
 * so repeated calls are always safe.
 */
export async function markNotificationRead(notificationId: string): Promise<Notification> {
  const { data } = await apiRequest<{ data: Notification }>(`/api/v1/notifications/${notificationId}/read`, {
    method: "POST",
  });
  return data;
}

/** POST /api/v1/notifications/read-all -- no body, no count in the response; only a confirmation message. */
export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest<{ message: string }>("/api/v1/notifications/read-all", {
    method: "POST",
  });
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
