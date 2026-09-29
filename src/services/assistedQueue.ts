import { secureStorage } from "./storage";
import type { AssistedEnrollmentInput, AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { createAssistedEnrollment } from "../api/assistedEnrollment";
import { isApiError } from "../api/errors";

const INDEX_KEY = "afn.assisted.pending.ids";
const ITEM_PREFIX = "afn.assisted.pending.";
const LIMIT = 10;

export interface PendingAssistedEnrollment {
  sponsorUserId: string;
  organizationId: string;
  input: AssistedEnrollmentInput;
}

async function ids(): Promise<string[]> {
  try {
    const raw = await secureStorage.get(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function listPendingAssisted(sponsorUserId: string, organizationId: string): Promise<PendingAssistedEnrollment[]> {
  const values = await Promise.all((await ids()).map((id) => secureStorage.get(ITEM_PREFIX + id)));
  return values.flatMap((raw) => {
    if (!raw) return [];
    try {
      const item = JSON.parse(raw) as PendingAssistedEnrollment;
      return item.sponsorUserId === sponsorUserId && item.organizationId === organizationId ? [item] : [];
    } catch {
      return [];
    }
  });
}

export async function savePendingAssisted(item: PendingAssistedEnrollment): Promise<void> {
  const existing = await ids();
  const id = item.input.client_request_id;
  if (existing.includes(id)) return;
  if (existing.length >= LIMIT) throw new Error("El teléfono alcanzó el límite de registros pendientes. Sincroniza antes de agregar más.");
  await secureStorage.set(ITEM_PREFIX + id, JSON.stringify(item));
  await secureStorage.set(INDEX_KEY, JSON.stringify([...existing, id]));
}

export async function removePendingAssisted(id: string): Promise<void> {
  const existing = await ids();
  await secureStorage.set(INDEX_KEY, JSON.stringify(existing.filter((value) => value !== id)));
  await secureStorage.remove(ITEM_PREFIX + id);
}

export async function syncPendingAssisted(
  sponsorUserId: string, organizationId: string,
): Promise<{ completed: AssistedEnrollmentResult[]; remaining: number }> {
  const items = await listPendingAssisted(sponsorUserId, organizationId);
  const completed: AssistedEnrollmentResult[] = [];
  for (const item of items) {
    try {
      const result = await createAssistedEnrollment(item.input);
      completed.push(result);
      await removePendingAssisted(item.input.client_request_id);
    } catch (error) {
      // Retry a timeout with the SAME client_request_id. The API returns
      // the existing enrollment if its response was lost.
      if (isApiError(error) && (error.kind === "offline" || error.kind === "timeout")) break;
      // Validation errors need the sponsor's attention; do not discard PII.
      break;
    }
  }
  return { completed, remaining: (await listPendingAssisted(sponsorUserId, organizationId)).length };
}
