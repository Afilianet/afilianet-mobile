import { fetch as expoFetch } from "expo/fetch";
import { secureStorage } from "./storage";
import type { AssistedEnrollmentInput, AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { createAssistedEnrollment } from "../api/assistedEnrollment";
import { captureApiSessionGuard } from "../api/client";
import { completeEvidenceUpload, fetchComplianceSteps, fetchMyCompliance, requestEvidenceUpload, startCompliance, submitComplianceGeolocation, triggerDocumentProcessing } from "../api/endpoints";
import { ApiError, friendlyMessage, isApiError } from "../api/errors";
import { openAssistedPhoto, removeAssistedPhoto, type AssistedPhoto } from "./assistedEvidenceVault";

import type { ComplianceGeolocationSubmission } from "../types/api";

const INDEX_KEY = "afn.assisted.pending.ids";
const ITEM_PREFIX = "afn.assisted.pending.";
const LIMIT = 10;
let mutationTail: Promise<unknown> = Promise.resolve();
let syncing = false;

/**
 * Not failures: the server answers the same on every retry, so a draft that
 * gets one stops syncing instead of retrying (and holding a third party's
 * data) forever. API #92 answers creation with assisted_enrollment_unavailable
 * and capture for a person who already activated their account with 409
 * assisted_access_claimed (permanent); capture with KYC off answers
 * kyc_unavailable (API #86) before that.
 */
export const BLOCKING_REASONS = ["assisted_enrollment_unavailable", "kyc_unavailable", "assisted_access_claimed"] as const;

/** Only an explicit retry makes sense once an organization re-enables a setting; activation never goes back. */
export function canRetryBlocked(reason: BlockingReason): boolean {
  return reason !== "assisted_access_claimed";
}
export type BlockingReason = (typeof BLOCKING_REASONS)[number];

export function blockingReason(error: unknown): BlockingReason | null {
  if (!isApiError(error) || !error.reason) return null;
  return (BLOCKING_REASONS as readonly string[]).includes(error.reason) ? (error.reason as BlockingReason) : null;
}

export interface PendingAssistedEnrollment {
  sponsorUserId: string;
  organizationId: string;
  input: AssistedEnrollmentInput;
  photos?: AssistedPhoto[];
  geolocation?: ComplianceGeolocationSubmission;
  geolocationUploaded?: boolean;
  enrollmentId?: string;
  uploadedTypes?: AssistedPhoto["evidenceType"][];
  /** Set before the first create request leaves the device: from then on the server may hold the enrollment. */
  createAttempted?: boolean;
  /** Refused by an organization setting: only a manual retry sends it again. */
  blocked?: { reason: BlockingReason; at: string };
}

/**
 * What the server may hold for this draft. Discarding only ever deletes the
 * copy on this phone, never the enrollment or evidence already sent.
 * A creation refusal is authoritative: the API answers a known
 * client_request_id with the existing enrollment even when switched off.
 */
export function serverStateOf(item: PendingAssistedEnrollment): "created" | "not_created" | "unknown" {
  if (item.enrollmentId) return "created";
  if (!item.createAttempted) return "not_created";
  // Only a creation refusal says nothing exists; an activated person has an enrollment by definition.
  if (item.blocked?.reason === "assisted_enrollment_unavailable") return "not_created";
  if (item.blocked?.reason === "assisted_access_claimed") return "created";
  return "unknown";
}

function mutate<T>(action: () => Promise<T>): Promise<T> {
  const next = mutationTail.then(action, action);
  mutationTail = next.catch(() => undefined);
  return next;
}

async function ids(): Promise<string[]> {
  const raw = await secureStorage.get(INDEX_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("No se pudo leer la lista de registros guardados.");
  }
  return parsed;
}

export async function listPendingAssisted(sponsorUserId: string, organizationId: string): Promise<PendingAssistedEnrollment[]> {
  const values = await Promise.all((await ids()).map((id) => secureStorage.get(ITEM_PREFIX + id)));
  return values.flatMap((raw) => {
    if (!raw) return [];
    const item = JSON.parse(raw) as PendingAssistedEnrollment;
    return item.sponsorUserId === sponsorUserId && item.organizationId === organizationId ? [item] : [];
  });
}

export async function savePendingAssisted(item: PendingAssistedEnrollment): Promise<void> {
  return mutate(async () => {
    const existing = await ids();
    const id = item.input.client_request_id;
    if (existing.includes(id)) return;
    if (existing.length >= LIMIT) throw new Error("El teléfono alcanzó el límite de registros pendientes. Sincroniza antes de agregar más.");
    await secureStorage.set(ITEM_PREFIX + id, JSON.stringify(item));
    await secureStorage.set(INDEX_KEY, JSON.stringify([...existing, id]));
  });
}

export async function replaceAssistedPhoto(
  sponsorUserId: string, organizationId: string, requestId: string, photo: AssistedPhoto,
): Promise<void> {
  return mutate(async () => {
    const item = (await listPendingAssisted(sponsorUserId, organizationId)).find((value) => value.input.client_request_id === requestId);
    if (!item) throw new Error("Este registro ya se sincronizó o no pertenece a esta sesión.");
    const previous = item.photos?.find((value) => value.evidenceType === photo.evidenceType);
    item.photos = [...(item.photos ?? []).filter((value) => value.evidenceType !== photo.evidenceType), photo];
    item.uploadedTypes = item.uploadedTypes?.filter((value) => value !== photo.evidenceType);
    await secureStorage.set(ITEM_PREFIX + requestId, JSON.stringify(item));
    if (previous) await removeExclusivePhotos(requestId, [previous]);
  });
}

export async function replaceAssistedGeolocation(
  sponsorUserId: string, organizationId: string, requestId: string,
  geolocation: ComplianceGeolocationSubmission | undefined,
): Promise<void> {
  return mutate(async () => {
    const item = (await listPendingAssisted(sponsorUserId, organizationId)).find((value) => value.input.client_request_id === requestId);
    if (!item) throw new Error("Este registro ya se sincronizó o no pertenece a esta sesión.");
    item.geolocation = geolocation;
    item.geolocationUploaded = false;
    await secureStorage.set(ITEM_PREFIX + requestId, JSON.stringify(item));
  });
}

/** Deletes these photos unless another pending draft still references the same sealed file or key. */
async function removeExclusivePhotos(ownerId: string, photos: AssistedPhoto[]): Promise<void> {
  if (!photos.length) return;
  const others = await Promise.all((await ids()).filter((id) => id !== ownerId).map((id) => secureStorage.get(ITEM_PREFIX + id)));
  const shared = new Set(others.flatMap((raw) => (raw ? (JSON.parse(raw) as PendingAssistedEnrollment).photos ?? [] : []))
    .flatMap((photo) => [photo.fileName, photo.keyName]));
  for (const photo of photos) {
    if (!shared.has(photo.fileName) && !shared.has(photo.keyName)) await removeAssistedPhoto(photo);
  }
}

async function removeUnlocked(id: string): Promise<void> {
  const raw = await secureStorage.get(ITEM_PREFIX + id);
  if (raw) await removeExclusivePhotos(id, (JSON.parse(raw) as PendingAssistedEnrollment).photos ?? []);
  const existing = await ids();
  await secureStorage.set(INDEX_KEY, JSON.stringify(existing.filter((value) => value !== id)));
  await secureStorage.remove(ITEM_PREFIX + id);
}

export async function removePendingAssisted(id: string): Promise<void> {
  return mutate(() => removeUnlocked(id));
}

async function updateItem(id: string, change: (item: PendingAssistedEnrollment) => void): Promise<void> {
  const raw = await secureStorage.get(ITEM_PREFIX + id);
  if (!raw) return;
  const item = JSON.parse(raw) as PendingAssistedEnrollment;
  change(item);
  await secureStorage.set(ITEM_PREFIX + id, JSON.stringify(item));
}

/** Manual retry after the organization changes its setting: the next sync sends the draft again. */
export async function retryBlockedAssisted(id: string): Promise<void> {
  return mutate(() => updateItem(id, (item) => {
    if (item.blocked && canRetryBlocked(item.blocked.reason)) delete item.blocked;
  }));
}

/** True while a sync may be sending a draft; a server lookup then could miss a creation about to commit. */
export function isAssistedSyncInProgress(): boolean {
  return syncing;
}

export async function syncPendingAssisted(
  sponsorUserId: string, organizationId: string,
): Promise<{ completed: AssistedEnrollmentResult[]; remaining: number; blocked: number; error?: string }> {
  const counts = async () => {
    const items = await listPendingAssisted(sponsorUserId, organizationId);
    return { remaining: items.length, blocked: items.filter((item) => item.blocked).length };
  };
  if (syncing) return { completed: [], ...(await counts()) };
  const stillCurrent = captureApiSessionGuard(organizationId);
  const requireCurrent = () => {
    if (!stillCurrent()) throw new ApiError("conflict", "La sesión o la organización cambió. Continúa la sincronización desde la cuenta original.");
  };
  syncing = true;
  const completed: AssistedEnrollmentResult[] = [];
  let syncError: string | undefined;
  try {
    const items = await listPendingAssisted(sponsorUserId, organizationId);
    for (const snapshot of items) {
      if (snapshot.blocked) continue;
      try {
        await mutate(async () => {
          requireCurrent();
          const item = (await listPendingAssisted(sponsorUserId, organizationId)).find((value) => value.input.client_request_id === snapshot.input.client_request_id);
          if (!item || item.blocked) return;
          if (!item.createAttempted) {
            item.createAttempted = true;
            await secureStorage.set(ITEM_PREFIX + item.input.client_request_id, JSON.stringify(item));
          }
          // Always reuse the original request id, including after a lost HTTP response.
          requireCurrent();
          const result = await createAssistedEnrollment(item.input);
          item.enrollmentId = result.id;
          await secureStorage.set(ITEM_PREFIX + item.input.client_request_id, JSON.stringify(item));
          const photos = item.photos ?? [];
          if (photos.length || item.geolocation) {
            // The replay answers "ready" once the person activated: the same permanent state the
            // capture endpoints answer with 409 assisted_access_claimed, so it is not sent again.
            if (result.access_status !== "pending") {
              throw new ApiError("conflict", "La persona ya activó su cuenta; ya no es posible capturar por ella.", 409, undefined, { reason: "assisted_access_claimed" });
            }
            if (photos.length && (!photos.some((photo) => photo.evidenceType === "id_document_front")
              || !photos.some((photo) => photo.evidenceType === "id_document_back"))) {
              throw new ApiError("validation", "Falta una cara de la INE guardada. Completa las fotos antes de sincronizarlas.");
            }
            requireCurrent();
            try { await fetchMyCompliance(result.id); } catch (error) {
              if (!isApiError(error) || error.kind !== "not_found") throw error;
              requireCurrent();
              await startCompliance(result.id);
            }
            requireCurrent();
            const steps = await fetchComplianceSteps(result.id);
            const document = steps.find((step) => step.step_type === "identity_document");
            if (!document) throw new ApiError("validation", "La organización no tiene un paso de documento de identidad para estas fotos.");
            for (const photo of photos) {
              if (item.uploadedTypes?.includes(photo.evidenceType)) continue;
              requireCurrent();
              const bytes = await openAssistedPhoto(photo);
              requireCurrent();
              const authorization = await requestEvidenceUpload(document.id, {
                evidence_type: photo.evidenceType, mime_type: photo.mimeType, size: bytes.byteLength,
              }, result.id);
              requireCurrent();
              const response = await expoFetch(authorization.upload.url, {
                method: "PUT",
                headers: Object.entries(authorization.upload.headers).filter(([name]) => name.toLowerCase() !== "host"),
                body: bytes.slice().buffer,
              });
              if (!response.ok) throw new ApiError("server", "No se pudo subir una foto. Sigue guardada para reintentar.");
              requireCurrent();
              await completeEvidenceUpload(authorization.evidence.id, result.id);
              item.uploadedTypes = [...(item.uploadedTypes ?? []), photo.evidenceType];
              await secureStorage.set(ITEM_PREFIX + item.input.client_request_id, JSON.stringify(item));
            }
            if (photos.length) {
            requireCurrent();
            try { await triggerDocumentProcessing(document.id, "mx_ine", result.id); } catch (error) {
              if (!isApiError(error) || error.kind !== "conflict") throw error;
              // Already queued by a previous response-lost retry; evidence is uploaded.
            }
            }
            // Send the saved observation, never recapture at the time of synchronization.
            // A failed request retains the encrypted draft for a later retry.
            if (item.geolocation && !item.geolocationUploaded) {
              requireCurrent();
              await submitComplianceGeolocation(document.id, item.geolocation, result.id);
              item.geolocationUploaded = true;
              await secureStorage.set(ITEM_PREFIX + item.input.client_request_id, JSON.stringify(item));
            }
          }
          completed.push(result);
          await removeUnlocked(item.input.client_request_id);
        });
      } catch (error) {
        const reason = blockingReason(error);
        if (reason) {
          // Kept as it is, data and photos included, until the sponsor discards or retries it.
          await mutate(() => updateItem(snapshot.input.client_request_id, (item) => { item.blocked = { reason, at: new Date().toISOString() }; }));
          continue;
        }
        // Network, timeout, server error or a session change: transient, retried on the next sync.
        syncError = isApiError(error) ? friendlyMessage(error) : "No se pudo sincronizar. El registro sigue guardado para reintentar.";
        break;
      }
    }
    return { completed, ...(await counts()), error: syncError };
  } finally {
    syncing = false;
  }
}
