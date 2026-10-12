import { useSyncExternalStore } from "react";
import { secureStorage } from "../services/storage";

/**
 * A referral the visitor opened (deep link or typed code) but has not
 * accepted yet. It survives registration, channel verification and sign-in
 * -- including an app restart in between -- so the person can confirm
 * joining with the account they end up using, instead of losing the
 * invitation. It is NOT bound to an account: it is cleared once accepted,
 * dismissed, expired, or when a session ends, so it can never carry over
 * into somebody else's session.
 */
export interface PendingReferral {
  organizationId: string;
  code: string;
  savedAt: number;
}

const STORAGE_KEY = "afilianet.pendingReferral";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

let current: PendingReferral | null = null;
const listeners = new Set<() => void>();

function publish(next: PendingReferral | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function isValid(value: unknown): value is PendingReferral {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingReferral>;
  return (
    typeof candidate.organizationId === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.savedAt === "number" &&
    SEGMENT.test(candidate.organizationId) &&
    SEGMENT.test(candidate.code)
  );
}

export async function hydratePendingReferral(now = Date.now()): Promise<PendingReferral | null> {
  try {
    const raw = await secureStorage.get(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isValid(parsed) && now - parsed.savedAt <= MAX_AGE_MS) {
      publish(parsed);
      return parsed;
    }
    if (raw) await secureStorage.remove(STORAGE_KEY);
  } catch {
    // Unreadable storage is the same as no pending referral.
  }
  publish(null);
  return null;
}

export async function savePendingReferral(organizationId: string, code: string, now = Date.now()): Promise<void> {
  if (!SEGMENT.test(organizationId) || !SEGMENT.test(code)) return;
  const next: PendingReferral = { organizationId, code, savedAt: now };
  publish(next);
  await secureStorage.set(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
}

export async function clearPendingReferral(): Promise<void> {
  publish(null);
  await secureStorage.remove(STORAGE_KEY).catch(() => undefined);
}

export function getPendingReferral(): PendingReferral | null {
  return current;
}

export function pendingReferralPath(referral: Pick<PendingReferral, "organizationId" | "code">): string {
  return `/join/${encodeURIComponent(referral.organizationId)}/${encodeURIComponent(referral.code)}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingReferral(): PendingReferral | null {
  return useSyncExternalStore(subscribe, getPendingReferral, getPendingReferral);
}
