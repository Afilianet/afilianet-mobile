import { randomUUID } from "expo-crypto";
import { apiRequest } from "./client";
import { isApiError } from "./errors";

/**
 * Privacy notices (API #91/#93, docs/privacy/PRIVACY_NOTICE_CONTRACT.md).
 *
 * A notice is information, not consent: what is recorded is which exact
 * version was shown, when and in which step. Consents per purpose are a
 * separate, explicit decision (recordConsent). The app never infers either.
 */

/** Reference to one exact version: what the steps and acknowledgements send. */
export interface NoticeRef {
  version: string;
  sha256: string;
}

export interface NoticePurpose {
  key: string;
  title: string;
  text: string;
  text_sha256?: string;
  required_for?: string[];
}

export type ChangeClass = "initial" | "editorial" | "informative" | "review_required" | "specific_consent";

/** A served document: the general notice (GET /privacy/notice) or an organization's supplement. */
export interface NoticeDocument {
  scope: string;
  version: string;
  controller_name: string;
  controller_address: string;
  contact_email: string;
  deletion_response_days: number;
  deletion_response_days_kind: string;
  sections: { title: string; text: string }[];
  /** Absent on an API before #91: such a document cannot be referenced. */
  content_sha256?: string;
  classification?: { change_class: ChangeClass };
  summary_of_changes?: string | null;
  purposes?: NoticePurpose[];
}

/** The `privacy` block of a step's public lookup (invitation, staff invitation, referral link). */
export interface StepPrivacy {
  required: boolean;
  privacy_notice: NoticeRef | null;
  organization_notice: NoticeDocument | null;
}

export type ActionRequired = "none" | "inform" | "review";

export interface PurposeDecision {
  key: string;
  title: string;
  text_sha256: string;
  required_for: string[];
  decision?: "granted" | "refused" | null;
  decided_at?: string | null;
}

export interface NoticeStatus {
  current: NoticeRef | null;
  change_class: ChangeClass | null;
  summary_of_changes: string | null;
  action_required: ActionRequired;
  acknowledged_current: boolean;
  last_acknowledged: { version: string; sha256: string; acknowledged_at: string; context: string } | null;
  purposes: PurposeDecision[];
}

export interface OrganizationNoticeStatus extends NoticeStatus {
  id: string;
  name: string;
}

export interface MyPrivacy {
  required: boolean;
  enforce_review?: boolean;
  privacy_notice: NoticeStatus;
  organizations: OrganizationNoticeStatus[];
}

/** The stable shape of `pending` in a 409 privacy_notice_review_required (contract §11, example 16b). */
export interface ReviewPending {
  privacy_notice: NoticeRef | null;
  organization_notice: (NoticeRef & { organization_id: string }) | null;
}

/** The react-query key of GET /me/privacy, per account. */
export const myPrivacyKey = (userId: string | undefined) => ["me-privacy", userId] as const;

export const PRIVACY_REVIEW_REQUIRED = "privacy_notice_review_required";
export const PRIVACY_NOTICE_OUTDATED = "privacy_notice_outdated";
export const PRIVACY_NOTICE_UNAVAILABLE = "privacy_notice_unavailable";
export const ORGANIZATION_NOTICE_UNAVAILABLE = "organization_notice_unavailable";

/** The reference of a document exactly as it was shown, or null when it cannot be referenced. */
export function refOf(document: NoticeDocument | null | undefined): NoticeRef | null {
  return document?.content_sha256 ? { version: document.version, sha256: document.content_sha256 } : null;
}

export function sameRef(a: NoticeRef | null | undefined, b: NoticeRef | null | undefined): boolean {
  return Boolean(a && b && a.version === b.version && a.sha256 === b.sha256);
}

/** One id per attempt, reused by its retries, so an uncertain answer never creates twice (contract §6). */
export function newClientRequestId(): string {
  return randomUUID();
}

/** The general notice, without a session. Null while it is not published (503). */
export async function fetchGeneralNotice(): Promise<NoticeDocument | null> {
  try {
    const { data } = await apiRequest<{ data: NoticeDocument }>("/api/v1/privacy/notice", {
      skipAuth: true,
      skipOrganization: true,
      skipUnauthorizedHandling: true,
    });
    return data;
  } catch (error) {
    if (isApiError(error) && error.status === 503) return null;
    throw error;
  }
}

/** This account's state per document. Null on an API without it (404 before #91). */
export async function fetchMyPrivacy(): Promise<MyPrivacy | null> {
  try {
    const { data } = await apiRequest<{ data: MyPrivacy }>("/api/v1/me/privacy", { skipOrganization: true });
    return data;
  } catch (error) {
    if (isApiError(error) && error.kind === "not_found") return null;
    throw error;
  }
}

/** The full supplement of one of this account's organizations, to show it before recording it. */
export async function fetchOrganizationNotice(organizationId: string): Promise<NoticeDocument> {
  const { data } = await apiRequest<{ data: NoticeDocument }>(
    `/api/v1/me/privacy/organizations/${encodeURIComponent(organizationId)}/notice`,
    { skipOrganization: true },
  );
  return data;
}

export type AcknowledgementInput =
  | { privacy_notice: NoticeRef; client_request_id: string }
  | { organization_id: string; organization_notice: NoticeRef; client_request_id: string };

/** Records that this account was shown one exact document. Answers with the new state. */
export async function recordAcknowledgement(input: AcknowledgementInput): Promise<MyPrivacy> {
  const { data } = await apiRequest<{ data: MyPrivacy }>("/api/v1/me/privacy/acknowledgements", {
    method: "POST",
    body: input,
    skipOrganization: true,
  });
  return data;
}

export interface ConsentInput {
  organization_id?: string;
  document: NoticeRef;
  purpose: string;
  decision: "granted" | "refused";
  client_request_id: string;
}

/** One explicit decision on one purpose of one document; `refused` also revokes. */
export async function recordConsent(input: ConsentInput): Promise<MyPrivacy> {
  const { data } = await apiRequest<{ data: MyPrivacy }>("/api/v1/me/privacy/consents", {
    method: "POST",
    body: input,
    skipOrganization: true,
  });
  return data;
}

/** The documents a step needs, as refs, from what was actually shown. */
export interface StepNoticeRefs {
  privacy_notice?: NoticeRef;
  organization_notice?: NoticeRef;
  client_request_id?: string;
}

export function isPrivacyReviewRequired(error: unknown): boolean {
  return isApiError(error) && error.reason === PRIVACY_REVIEW_REQUIRED;
}

export function isNoticeOutdated(error: unknown): boolean {
  return isApiError(error) && error.reason === PRIVACY_NOTICE_OUTDATED;
}

/** A 422 that asks for the general notice in this step (contract §4, example 17d). */
export function needsGeneralNotice(error: unknown): boolean {
  return isApiError(error) && error.kind === "validation" && Boolean(error.details?.privacy_notice);
}

/** Whether a status needs anything from the person: review blocks only with enforcement, inform never does. */
export function statusNeedsAttention(status: Pick<NoticeStatus, "action_required">): boolean {
  return status.action_required !== "none";
}
