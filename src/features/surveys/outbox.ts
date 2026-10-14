import { randomUUID } from "expo-crypto";
import { captureApiSessionGuard } from "../../api/client";
import { isApiError } from "../../api/errors";
import type { SurveySource } from "./source";
import type { AudioConfig, ConsentAudio, RespondentType, SurveyAnswer } from "./types";
import { listScopes, openBytes, openJson, removeItem, sealJson, type SurveyScope } from "./vault";

/**
 * Persistent outbox for completed survey responses, per account+organization
 * (contract: API feat/survey-module @ aa94798).
 *
 * - Answers first, audio second: a pass submits every pending answer set,
 *   then a pass uploads audio (it needs the server's response id and an
 *   accepted consent).
 * - client_response_id is generated once on the device; the server returns
 *   the ORIGINAL response for a repeat (201), so a resend after a lost reply,
 *   a crash or a double tap never duplicates.
 * - The local copy is deleted ONLY after the server confirmed it.
 * - A sync is bound to the session and organization it started in; if either
 *   changes it stops before the next request.
 * - Permanent refusals (version closed, not an assigned surveyor, modality
 *   not allowed) are never retried automatically: the item is KEPT, blocked,
 *   until the person decides.
 */

const OUTBOX = "outbox";
const RECEIPTS = "receipts";
const MAX_RECEIPTS = 50;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 10 * 60_000;

export type BlockReason = "survey_version_closed" | "not_assigned_surveyor" | "respondent_type_not_allowed" | "not_a_member";
export type AudioRejectReason = "unsupported_mime_type" | "object_too_large" | "audio_consent_required";

export interface OutboxAudio {
  clientAudioId: string;
  mimeType: string;
  durationMs: number;
  interrupted: boolean;
  bytes: number;
  /** Set once the server confirmed the upload. */
  receivedAt?: string;
  /** Permanently refused (type/size/consent): kept until the person discards it. */
  rejected?: AudioRejectReason;
}

export interface OutboxItem {
  id: string;
  surveyId: string;
  versionId: string;
  surveyTitle: string;
  respondentType: RespondentType;
  consentAudio: ConsentAudio | null;
  completedAt: string;
  audio: OutboxAudio | null;
  responseId?: string;
  receivedAt?: string;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  blocked?: BlockReason;
}

export interface OutboxReceipt {
  id: string;
  surveyTitle: string;
  receivedAt: string;
  withAudio: boolean;
}

/**
 * Distinct states, never merged:
 * - saved: answers on this phone; no send attempted yet.
 * - pending_sync: waiting to send the answers.
 * - audio_pending: the server has the answers; the audio is still on this phone.
 * - audio_rejected: the server has the answers; it will not take this audio.
 * - blocked: the server will not take the answers (see BlockReason).
 * ("Recibido" is an OutboxReceipt: once confirmed, nothing stays on the phone.)
 */
export type OutboxDisplayState = "saved" | "pending_sync" | "audio_pending" | "audio_rejected" | "blocked";

export function displayState(item: OutboxItem): OutboxDisplayState {
  if (item.blocked) return "blocked";
  if (item.responseId) return item.audio?.rejected ? "audio_rejected" : "audio_pending";
  return item.attempts > 0 ? "pending_sync" : "saved";
}

const answersName = (id: string) => `answers-${id}`;
export const audioName = (clientAudioId: string) => `audio-${clientAudioId}`;

let tail: Promise<unknown> = Promise.resolve();
const syncing = new Set<string>();

function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = tail.then(action, action);
  tail = next.catch(() => undefined);
  return next;
}

async function readIndex(scope: SurveyScope): Promise<OutboxItem[]> {
  return (await openJson<OutboxItem[]>(scope, OUTBOX)) ?? [];
}

async function writeIndex(scope: SurveyScope, items: OutboxItem[]): Promise<void> {
  await sealJson(scope, OUTBOX, items);
}

export function newClientId(): string {
  return randomUUID();
}

export async function listOutbox(scope: SurveyScope): Promise<OutboxItem[]> {
  return serialized(() => readIndex(scope));
}

export async function listReceipts(scope: SurveyScope): Promise<OutboxReceipt[]> {
  return (await openJson<OutboxReceipt[]>(scope, RECEIPTS)) ?? [];
}

/** Stores a completed response on the phone ("Guardado en el dispositivo"). Audio, if any, was sealed already. */
export async function enqueueResponse(scope: SurveyScope, item: Omit<OutboxItem, "attempts">, answers: SurveyAnswer[]): Promise<OutboxItem> {
  return serialized(async () => {
    const items = await readIndex(scope);
    const existing = items.find((value) => value.id === item.id);
    if (existing) return existing;
    await sealJson(scope, answersName(item.id), answers);
    const stored: OutboxItem = { ...item, attempts: 0 };
    await writeIndex(scope, [...items, stored]);
    return stored;
  });
}

async function recordReceipt(scope: SurveyScope, item: OutboxItem, receivedAt: string, withAudio: boolean) {
  const receipts = await listReceipts(scope);
  await sealJson(scope, RECEIPTS, [
    { id: item.id, surveyTitle: item.surveyTitle, receivedAt, withAudio },
    ...receipts.filter((receipt) => receipt.id !== item.id),
  ].slice(0, MAX_RECEIPTS));
}

/** Explicit, user-confirmed discard of one whole response (e.g. its survey closed). */
export async function discardResponse(scope: SurveyScope, id: string): Promise<void> {
  return serialized(async () => {
    const items = await readIndex(scope);
    const item = items.find((value) => value.id === id);
    if (!item) return;
    await removeItem(scope, answersName(id));
    if (item.audio) await removeItem(scope, audioName(item.audio.clientAudioId));
    await writeIndex(scope, items.filter((value) => value.id !== id));
  });
}

/** Explicit discard of an audio the server refused; the already-received answers become a receipt. */
export async function discardRejectedAudio(scope: SurveyScope, id: string): Promise<void> {
  return serialized(async () => {
    const items = await readIndex(scope);
    const item = items.find((value) => value.id === id);
    if (!item?.audio?.rejected || !item.responseId) return;
    await removeItem(scope, audioName(item.audio.clientAudioId));
    await recordReceipt(scope, item, item.receivedAt ?? new Date().toISOString(), false);
    await writeIndex(scope, items.filter((value) => value.id !== id));
  });
}

/** Items still on the phone for one account, across all its organizations (sign-out check). */
export async function pendingForAccount(userId: string): Promise<{ scope: SurveyScope; items: OutboxItem[] }[]> {
  const result: { scope: SurveyScope; items: OutboxItem[] }[] = [];
  for (const scope of await listScopes()) {
    if (scope.userId !== userId) continue;
    const items = await listOutbox(scope).catch(() => []);
    if (items.length) result.push({ scope, items });
  }
  return result;
}

export interface SyncProgress {
  phase: "answers" | "audio";
  done: number;
  total: number;
}

export interface SyncResult {
  received: number;
  remaining: number;
  /** Set when the whole pass stopped early (offline, session/organization changed). */
  stoppedReason?: "offline" | "session_changed";
  errors: string[];
}

class SessionChanged extends Error {}

function backoff(attempts: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

function blockReason(error: unknown): BlockReason | null {
  if (!isApiError(error)) return null;
  if (error.reason === "survey_version_closed") return "survey_version_closed";
  if (error.reason === "not_assigned_surveyor") return "not_assigned_surveyor";
  if (error.reason === "respondent_type_not_allowed") return "respondent_type_not_allowed";
  if (error.kind === "forbidden") return "not_a_member";
  return null;
}

function audioRejection(error: unknown): AudioRejectReason | null {
  if (!isApiError(error)) return null;
  if (error.reason === "unsupported_mime_type" || error.reason === "object_too_large" || error.reason === "audio_consent_required") return error.reason;
  return null;
}

/**
 * Sends what is pending for ONE account+organization. `force` ignores the
 * retry backoff (the person tapped "Sincronizar ahora"); blocked items are
 * never resent automatically.
 */
export async function syncOutbox(
  scope: SurveyScope,
  source: SurveySource,
  options: { force?: boolean; now?: () => number; onProgress?: (progress: SyncProgress) => void } = {},
): Promise<SyncResult> {
  const key = `${scope.userId}.${scope.organizationId}`;
  const now = options.now ?? Date.now;
  if (syncing.has(key)) return { received: 0, remaining: (await listOutbox(scope)).length, errors: [] };
  syncing.add(key);
  const stillCurrent = captureApiSessionGuard(scope.organizationId);
  const requireCurrent = () => {
    if (!stillCurrent()) throw new SessionChanged();
  };
  const result: SyncResult = { received: 0, remaining: 0, errors: [] };

  // Each mutation re-reads the index, so a concurrent enqueue is never lost.
  const update = (id: string, change: (item: OutboxItem) => OutboxItem | null) =>
    serialized(async () => {
      const items = await readIndex(scope);
      const next: OutboxItem[] = [];
      for (const item of items) {
        if (item.id !== id) next.push(item);
        else {
          const changed = change(item);
          if (changed) next.push(changed);
        }
      }
      await writeIndex(scope, next);
    });

  const complete = async (item: OutboxItem, receivedAt: string, withAudio: boolean) => {
    await serialized(() => recordReceipt(scope, item, receivedAt, withAudio));
    await update(item.id, () => null);
    result.received += 1;
  };

  const recordFailure = async (item: OutboxItem, error: unknown) => {
    const offline = isApiError(error) && (error.kind === "offline" || error.kind === "timeout");
    await update(item.id, (current) => ({
      ...current,
      attempts: current.attempts + 1,
      nextAttemptAt: now() + backoff(current.attempts + 1),
      lastError: offline ? "offline" : isApiError(error) ? error.kind : "unknown",
    }));
    if (offline) throw error;
    result.errors.push(item.id);
  };

  const due = (item: OutboxItem) => !item.blocked && (options.force || !item.nextAttemptAt || item.nextAttemptAt <= now());

  try {
    // Pass 1: answers.
    const answersDue = (await listOutbox(scope)).filter((item) => !item.responseId && due(item));
    for (const [index, snapshot] of answersDue.entries()) {
      options.onProgress?.({ phase: "answers", done: index, total: answersDue.length });
      requireCurrent();
      const answers = await openJson<SurveyAnswer[]>(scope, answersName(snapshot.id));
      if (!answers) {
        await update(snapshot.id, (current) => ({ ...current, lastError: "local_missing" }));
        result.errors.push(snapshot.id);
        continue;
      }
      try {
        const receipt = await source.submitResponse(scope.organizationId, snapshot.versionId, {
          client_response_id: snapshot.id,
          respondent_type: snapshot.respondentType,
          submitted_at: snapshot.completedAt,
          consent_audio: snapshot.consentAudio,
          // Contract rule (API aa94798): the version's own id identifies the consent text that was read.
          consent_version: snapshot.consentAudio ? snapshot.versionId : null,
          answers,
        });
        requireCurrent();
        // Confirmed by the server: only now may the local answers go.
        await update(snapshot.id, (current) => ({
          ...current,
          responseId: receipt.id,
          receivedAt: receipt.received_at,
          attempts: 0,
          nextAttemptAt: undefined,
          lastError: undefined,
        }));
        await removeItem(scope, answersName(snapshot.id));
        const expectsAudio = Boolean(snapshot.audio) && snapshot.consentAudio === "accepted";
        if (!expectsAudio) {
          if (snapshot.audio) await removeItem(scope, audioName(snapshot.audio.clientAudioId));
          await complete(snapshot, receipt.received_at, false);
        }
      } catch (error) {
        if (error instanceof SessionChanged) throw error;
        const blocked = blockReason(error);
        if (blocked) {
          await update(snapshot.id, (current) => ({ ...current, blocked, nextAttemptAt: undefined, lastError: undefined }));
          continue;
        }
        await recordFailure(snapshot, error);
      }
    }

    // Pass 2: audio, only for responses the server already has.
    const audioDue = (await listOutbox(scope)).filter(
      (item) => item.responseId && item.audio && !item.audio.receivedAt && !item.audio.rejected && due(item),
    );
    let audioConfig: AudioConfig | null = null;
    for (const [index, snapshot] of audioDue.entries()) {
      options.onProgress?.({ phase: "audio", done: index, total: audioDue.length });
      const audio = snapshot.audio!;
      requireCurrent();
      try {
        // Limits are read from the server, never hardcoded.
        audioConfig ??= await source.getAudioConfig(scope.organizationId);
        requireCurrent();
        const localRejection: AudioRejectReason | null = !audioConfig.allowed_mime_types.includes(audio.mimeType)
          ? "unsupported_mime_type"
          : audio.bytes > audioConfig.max_bytes
            ? "object_too_large"
            : null;
        if (localRejection) {
          await update(snapshot.id, (current) => ({ ...current, audio: current.audio && { ...current.audio, rejected: localRejection } }));
          continue;
        }
        const bytes = await openBytes(scope, audioName(audio.clientAudioId));
        if (!bytes) {
          await update(snapshot.id, (current) => ({ ...current, lastError: "local_missing" }));
          result.errors.push(snapshot.id);
          continue;
        }
        await source.uploadAudio(scope.organizationId, {
          responseId: snapshot.responseId!,
          mimeType: audio.mimeType,
          bytes,
          durationSeconds: Math.max(1, Math.round(audio.durationMs / 1000)),
          interrupted: audio.interrupted,
        }, requireCurrent);
        requireCurrent();
        await removeItem(scope, audioName(audio.clientAudioId));
        await complete(snapshot, snapshot.receivedAt ?? new Date().toISOString(), true);
      } catch (error) {
        if (error instanceof SessionChanged) throw error;
        const rejected = audioRejection(error);
        if (rejected) {
          await update(snapshot.id, (current) => ({ ...current, audio: current.audio && { ...current.audio, rejected } }));
          continue;
        }
        await recordFailure(snapshot, error);
      }
    }
  } catch (error) {
    if (error instanceof SessionChanged) result.stoppedReason = "session_changed";
    else if (isApiError(error) && (error.kind === "offline" || error.kind === "timeout")) result.stoppedReason = "offline";
    else throw error;
  } finally {
    syncing.delete(key);
  }
  result.remaining = (await listOutbox(scope)).length;
  return result;
}
