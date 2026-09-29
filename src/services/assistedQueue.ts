import { fetch as expoFetch } from "expo/fetch";
import { secureStorage } from "./storage";
import type { AssistedEnrollmentInput, AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { createAssistedEnrollment } from "../api/assistedEnrollment";
import { captureApiSessionGuard } from "../api/client";
import { completeEvidenceUpload, fetchComplianceSteps, fetchMyCompliance, requestEvidenceUpload, startCompliance, triggerDocumentProcessing } from "../api/endpoints";
import { ApiError, friendlyMessage, isApiError } from "../api/errors";
import { openAssistedPhoto, removeAssistedPhoto, type AssistedPhoto } from "./assistedEvidenceVault";

const INDEX_KEY = "afn.assisted.pending.ids";
const ITEM_PREFIX = "afn.assisted.pending.";
const LIMIT = 10;
let mutationTail: Promise<unknown> = Promise.resolve();
let syncing = false;

export interface PendingAssistedEnrollment {
  sponsorUserId: string;
  organizationId: string;
  input: AssistedEnrollmentInput;
  photos?: AssistedPhoto[];
  enrollmentId?: string;
  uploadedTypes?: AssistedPhoto["evidenceType"][];
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
    if (previous) await removeAssistedPhoto(previous);
  });
}

async function removeUnlocked(id: string): Promise<void> {
  const raw = await secureStorage.get(ITEM_PREFIX + id);
  if (raw) {
    const item = JSON.parse(raw) as PendingAssistedEnrollment;
    for (const photo of item.photos ?? []) await removeAssistedPhoto(photo);
  }
  const existing = await ids();
  await secureStorage.set(INDEX_KEY, JSON.stringify(existing.filter((value) => value !== id)));
  await secureStorage.remove(ITEM_PREFIX + id);
}

export async function removePendingAssisted(id: string): Promise<void> {
  return mutate(() => removeUnlocked(id));
}

export async function syncPendingAssisted(
  sponsorUserId: string, organizationId: string,
): Promise<{ completed: AssistedEnrollmentResult[]; remaining: number; error?: string }> {
  if (syncing) return { completed: [], remaining: (await listPendingAssisted(sponsorUserId, organizationId)).length };
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
      try {
        await mutate(async () => {
          requireCurrent();
          const item = (await listPendingAssisted(sponsorUserId, organizationId)).find((value) => value.input.client_request_id === snapshot.input.client_request_id);
          if (!item) return;
          // Always reuse the original request id, including after a lost HTTP response.
          requireCurrent();
          const result = await createAssistedEnrollment(item.input);
          item.enrollmentId = result.id;
          await secureStorage.set(ITEM_PREFIX + item.input.client_request_id, JSON.stringify(item));
          const photos = item.photos ?? [];
          if (photos.length) {
            if (result.access_status !== "pending") throw new ApiError("conflict", "La persona ya activó su cuenta. Debe continuar la captura de su ID desde su propia sesión.");
            if (!photos.some((photo) => photo.evidenceType === "id_document_front")
              || !photos.some((photo) => photo.evidenceType === "id_document_back")) {
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
            requireCurrent();
            try { await triggerDocumentProcessing(document.id, "mx_ine", result.id); } catch (error) {
              if (!isApiError(error) || error.kind !== "conflict") throw error;
              // Already queued by a previous response-lost retry; evidence is uploaded.
            }
          }
          completed.push(result);
          await removeUnlocked(item.input.client_request_id);
        });
      } catch (error) {
        syncError = isApiError(error) ? friendlyMessage(error) : "No se pudo sincronizar. El registro sigue guardado para reintentar.";
        break;
      }
    }
    return { completed, remaining: (await listPendingAssisted(sponsorUserId, organizationId)).length, error: syncError };
  } finally {
    syncing = false;
  }
}
