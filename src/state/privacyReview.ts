import { useSyncExternalStore } from "react";
import type { MyPrivacy } from "../api/privacy";

/**
 * Whether the server is blocking this session until it reviews a notice
 * (API #93, PRIVACY_NOTICE_ENFORCE_REVIEW). Fed by the 409
 * privacy_notice_review_required of any request (api/client.ts) and by
 * GET /me/privacy; cleared on every session change (AuthProvider), so one
 * account's review never blocks another.
 *
 * The general notice blocks everything; an organization's supplement only
 * blocks while that organization is the active one (the server applies it
 * per X-Organization-ID).
 */
export interface PrivacyReviewState {
  general: boolean;
  organizationIds: string[];
}

let state: PrivacyReviewState | null = null;
const listeners = new Set<() => void>();

function publish(next: PrivacyReviewState | null) {
  const empty = !next || (!next.general && next.organizationIds.length === 0);
  state = empty ? null : next;
  listeners.forEach((listener) => listener());
}

function readPending(pending: unknown): { general: boolean; organizationId: string | null } {
  if (!pending || typeof pending !== "object") return { general: false, organizationId: null };
  const { privacy_notice: general, organization_notice: organization } = pending as {
    privacy_notice?: unknown;
    organization_notice?: { organization_id?: unknown } | null;
  };
  const organizationId = typeof organization?.organization_id === "string" ? organization.organization_id : null;
  return { general: Boolean(general), organizationId };
}

/**
 * A 409 privacy_notice_review_required. Without a readable `pending` the
 * request's own organization (or the general notice, without one) is the
 * conservative reading: the screen then shows whatever GET /me/privacy says.
 */
export function markPrivacyReviewRequired(pending: unknown, requestOrganizationId: string | null) {
  const read = readPending(pending);
  const general = read.general || (!read.organizationId && !requestOrganizationId);
  const organizationId = read.organizationId ?? (read.general ? null : requestOrganizationId);
  const previous = state ?? { general: false, organizationIds: [] };
  publish({
    general: previous.general || general,
    organizationIds: organizationId && !previous.organizationIds.includes(organizationId)
      ? [...previous.organizationIds, organizationId]
      : previous.organizationIds,
  });
}

/** GET /me/privacy is the full picture: it replaces what the 409s collected. Without enforcement nothing blocks. */
export function syncPrivacyReview(status: MyPrivacy | null) {
  if (!status?.enforce_review) {
    publish(null);
    return;
  }
  publish({
    general: status.privacy_notice.action_required === "review",
    organizationIds: status.organizations.filter((org) => org.action_required === "review").map((org) => org.id),
  });
}

export function clearPrivacyReview() {
  publish(null);
}

export function getPrivacyReview(): PrivacyReviewState | null {
  return state;
}

/** Whether the review blocks the session with this organization active. */
export function reviewBlocks(review: PrivacyReviewState | null, activeOrganizationId: string | null | undefined): boolean {
  if (!review) return false;
  return review.general || Boolean(activeOrganizationId && review.organizationIds.includes(activeOrganizationId));
}

export function usePrivacyReview(): PrivacyReviewState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}
