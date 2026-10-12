import { randomUUID } from "expo-crypto";
import { captureApiSessionGuard } from "../../api/client";
import { isApiError } from "../../api/errors";
import type { SurveySource } from "./source";
import type { SurveyAnswer, SurveyModality } from "./types";
import { listScopes, openBytes, openJson, removeItem, sealJson, type SurveyScope } from "./vault";

/**
 * Persistent outbox for completed survey responses, per account+organization.
 *
 * Order and safety rules:
 * - Answers first, audio second: a whole pass submits every pending answer
 *   set (small, the part that matters most on a weak network), then a pass
 *   uploads audio, which needs the server's response_id.
 * - Every send carries an id generated once on the device
 *   (client_response_id / client_audio_id); repeating a send after a lost
 *   reply, a crash or a double tap returns the same server record.
 * - The local copy is deleted ONLY after the server confirmed it (receipt).
 * - A sync is bound to the session and organization it started in: if
 *   either changes mid-way it stops before the next request, so nothing is
 *   ever sent or attributed under another account or organization.
 * - A closed survey blocks the item and KEEPS it; the person decides.
 */

const OUTBOX = "outbox";
const RECEIPTS = "receipts";
const MAX_RECEIPTS = 50;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 10 * 60_000;

export interface OutboxAudio {
  clientAudioId: string;
  mimeType: string;
  durationMs: number;
  interrupted: boolean;
  bytes: number;
  receivedAt?: string;
}

export interface OutboxItem {
  id: string;
  surveyId: string;
  versionId: string;
  surveyTitle: string;
  modality: SurveyModality;
  respondentLabel: string | null;
  completedAt: string;
  recordingConsent: boolean;
  audio: OutboxAudio | null;
  responseId?: string;
  receivedAt?: string;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  blocked?: "survey_closed";
}

export interface OutboxReceipt {
  id: string;
  surveyTitle: string;
  receivedAt: string;
  withAudio: boolean;
}

/**
 * The four states the person sees, never merged:
 * - saved: answers are on this phone; no send attempted yet.
 * - pending_sync: waiting to send the answers (an attempt failed or is due).
 * - audio_pending: the server has the answers; the audio is still on this phone.
 * - blocked: the server will not take it (survey closed); kept until the person decides.
 * ("Recibido" is an OutboxReceipt: once confirmed, nothing stays on the phone.)
 */
export type OutboxDisplayState = "saved" | "pending_sync" | "audio_pending" | "blocked";

export function displayState(item: OutboxItem): OutboxDisplayState {
  if (item.blocked) return "blocked";
  if (item.responseId) return "audio_pending";
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
export async function enqueueResponse(
  scope: SurveyScope,
  item: Omit<OutboxItem, "attempts">,
  answers: SurveyAnswer[],
): Promise<OutboxItem> {
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

/** Explicit, user-confirmed discard of one response (e.g. its survey closed). */
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

/**
 * Sends what is pending for ONE account+organization. `force` ignores the
 * retry backoff (the person tapped "Sincronizar ahora").
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

  const recordFailure = async (item: OutboxItem, error: unknown) => {
    const offline = isApiError(error) && (error.kind === "offline" || error.kind === "timeout");
    const closed = isApiError(error) && error.reason === "survey_closed";
    await update(item.id, (current) => ({
      ...current,
      attempts: current.attempts + 1,
      nextAttemptAt: closed ? undefined : now() + backoff(current.attempts + 1),
      lastError: closed ? undefined : offline ? "offline" : isApiError(error) ? error.kind : "unknown",
      blocked: closed ? "survey_closed" : current.blocked,
    }));
    if (offline) throw error;
    if (!closed) result.errors.push(item.id);
  };

  const complete = async (item: OutboxItem, receivedAt: string) => {
    const receipts = await listReceipts(scope);
    await sealJson(scope, RECEIPTS, [
      { id: item.id, surveyTitle: item.surveyTitle, receivedAt, withAudio: Boolean(item.audio) },
      ...receipts.filter((receipt) => receipt.id !== item.id),
    ].slice(0, MAX_RECEIPTS));
    await update(item.id, () => null);
    result.received += 1;
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
        const receipt = await source.submitResponse(scope.organizationId, {
          client_response_id: snapshot.id,
          survey_id: snapshot.surveyId,
          version_id: snapshot.versionId,
          modality: snapshot.modality,
          respondent_label: snapshot.respondentLabel,
          answers,
          completed_at: snapshot.completedAt,
          recording_consent: snapshot.recordingConsent,
          audio_expected: Boolean(snapshot.audio),
        });
        requireCurrent();
        // Confirmed by the server: only now may the local answers go.
        await update(snapshot.id, (current) => ({
          ...current,
          responseId: receipt.response_id,
          receivedAt: receipt.received_at,
          attempts: 0,
          nextAttemptAt: undefined,
          lastError: undefined,
        }));
        await removeItem(scope, answersName(snapshot.id));
        if (!snapshot.audio) await complete({ ...snapshot }, receipt.received_at);
      } catch (error) {
        if (error instanceof SessionChanged) throw error;
        await recordFailure(snapshot, error);
      }
    }

    // Pass 2: audio, only for responses the server already has.
    const audioDue = (await listOutbox(scope)).filter((item) => item.responseId && item.audio && !item.audio.receivedAt && due(item));
    for (const [index, snapshot] of audioDue.entries()) {
      options.onProgress?.({ phase: "audio", done: index, total: audioDue.length });
      const audio = snapshot.audio!;
      requireCurrent();
      const bytes = await openBytes(scope, audioName(audio.clientAudioId));
      if (!bytes) {
        await update(snapshot.id, (current) => ({ ...current, lastError: "local_missing" }));
        result.errors.push(snapshot.id);
        continue;
      }
      try {
        const receipt = await source.uploadAudio(scope.organizationId, {
          response_id: snapshot.responseId!,
          client_audio_id: audio.clientAudioId,
          mime_type: audio.mimeType,
          bytes,
          duration_ms: audio.durationMs,
          interrupted: audio.interrupted,
        });
        requireCurrent();
        await removeItem(scope, audioName(audio.clientAudioId));
        await complete(snapshot, receipt.received_at);
      } catch (error) {
        if (error instanceof SessionChanged) throw error;
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
