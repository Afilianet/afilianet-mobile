import { strings } from "../../i18n";
import {
  isSendableOrigin,
  ledgerKey,
  legacyInboxOrigin,
  legacyOrigin,
  OriginMismatchError,
  originStorageKey,
  readOriginLedger,
  resolveOrigin,
  type OriginLedger,
  type SurveyOrigin,
} from "./origin";
import type { SurveySource } from "./source";
import type { AvailableSurvey, ConsentAudio, RespondentType, SurveyAnswer, SurveyQuestion, SurveyVersion } from "./types";
import { openJson, removeItem, sealJson, type SurveyScope } from "./vault";

/**
 * What a person can use WITHOUT a connection, per account+organization:
 * questionnaire versions they explicitly downloaded, the last inbox they
 * saw, and their drafts. Offline capture is only possible for a downloaded
 * version -- nothing is fetched lazily mid-survey.
 *
 * Every record carries its origin (origin.ts), set when it is created and
 * never changed. Records read back always have `origin` filled in: their own,
 * or -- for those stored before origins existed -- their classification
 * ("fixture" with unequivocal evidence, else "unconfirmed").
 */

export interface DownloadedVersion {
  version: SurveyVersion;
  downloadedAt: string;
  /** Absent on downloads stored before origins existed. */
  origin?: SurveyOrigin;
}

export interface CachedInbox {
  surveys: AvailableSurvey[];
  fetchedAt: string;
  origin?: SurveyOrigin;
}

export interface DraftAudio {
  /** Local only: names the sealed file on this phone. */
  clientAudioId: string;
  mimeType: string;
  durationMs: number;
  interrupted: boolean;
  bytes: number;
  /** The origin it was recorded under; always its draft's. Absent on audio recorded before origins existed. */
  origin?: SurveyOrigin;
}

/** A draft answer as typed: option ids, text, or a number. */
export type DraftValue = number[] | string | number | null;

export interface SurveyDraft {
  id: string;
  surveyId: string;
  versionId: string;
  surveyTitle: string;
  respondentType: RespondentType;
  answers: Record<number, DraftValue>;
  /** Interviews with audio only: null until decided. Irreversible once submitted. */
  consentAudio: ConsentAudio | null;
  audio: DraftAudio | null;
  updatedAt: string;
  /** Required on new drafts; absent on drafts stored before origins existed. */
  origin?: SurveyOrigin;
}

export const versionName = (surveyId: string) => `version-${surveyId}`;
export const draftName = (id: string) => `draft-${id}`;
/** The single saved inbox of builds before origins existed; never written again. */
export const INBOX = "inbox";
/** Each origin keeps its own saved inbox, so refreshing one never replaces another's offline list. */
const inboxName = (origin: SurveyOrigin) => `inbox-${originStorageKey(origin)}`;
export const DRAFTS = "drafts";

type WithOrigin<T> = T & { origin: SurveyOrigin };

export const versionOrigin = (downloaded: DownloadedVersion, ledger: OriginLedger) =>
  resolveOrigin(downloaded.origin, ledger, ledgerKey.version(downloaded.version?.survey_id), () => legacyOrigin(downloaded.version?.survey_id, downloaded.version?.id));
export const draftOrigin = (draft: SurveyDraft, ledger: OriginLedger) =>
  resolveOrigin(draft.origin, ledger, ledgerKey.draft(draft.id), () => legacyOrigin(draft.surveyId, draft.versionId));
const inboxOrigin = (inbox: CachedInbox, ledger: OriginLedger) => resolveOrigin(inbox.origin, ledger, ledgerKey.inbox, () => legacyInboxOrigin(inbox.surveys));

function requireOrigin(origin: SurveyOrigin | undefined): SurveyOrigin {
  if (!isSendableOrigin(origin)) throw new OriginMismatchError("A new survey record needs the origin of an active source.");
  return origin;
}

export async function downloadVersion(scope: SurveyScope, source: SurveySource, available: AvailableSurvey): Promise<WithOrigin<DownloadedVersion>> {
  const origin = requireOrigin(source.origin);
  const version = await source.getVersion(scope.organizationId, available.id);
  const downloaded = { version, downloadedAt: new Date().toISOString(), origin };
  await sealJson(scope, versionName(available.survey_id), downloaded);
  return downloaded;
}

/** With `origin`, a download from any other origin reads as not downloaded (it stays on the phone). */
export async function getDownloaded(scope: SurveyScope, surveyId: string, origin?: SurveyOrigin): Promise<WithOrigin<DownloadedVersion> | null> {
  const downloaded = await openJson<DownloadedVersion>(scope, versionName(surveyId));
  if (!downloaded) return null;
  const resolved = { ...downloaded, origin: versionOrigin(downloaded, await readOriginLedger(scope)) };
  return origin === undefined || resolved.origin === origin ? resolved : null;
}

export async function removeDownloaded(scope: SurveyScope, surveyId: string): Promise<void> {
  await removeItem(scope, versionName(surveyId));
}

/** Fetches the inbox (open versions only) and remembers it, so it can be shown offline. */
export async function refreshInbox(scope: SurveyScope, source: SurveySource): Promise<WithOrigin<CachedInbox>> {
  const origin = requireOrigin(source.origin);
  const inbox = { surveys: await source.listAvailable(scope.organizationId), fetchedAt: new Date().toISOString(), origin };
  await sealJson(scope, inboxName(origin), inbox);
  return inbox;
}

/**
 * This origin's saved inbox; else the single one older builds kept, only if
 * it belongs to this origin. With no `origin`, that older one (any origin).
 * Another origin's list is never shown as this one's.
 */
export async function cachedInbox(scope: SurveyScope, origin?: SurveyOrigin): Promise<WithOrigin<CachedInbox> | null> {
  if (origin !== undefined) {
    const own = await openJson<CachedInbox>(scope, inboxName(origin));
    if (own) return { ...own, origin };
  }
  const inbox = await openJson<CachedInbox>(scope, INBOX);
  if (!inbox) return null;
  const resolved = { ...inbox, origin: inboxOrigin(inbox, await readOriginLedger(scope)) };
  return origin === undefined || resolved.origin === origin ? resolved : null;
}

/** Every draft on the phone for this account+organization, of every origin; callers split them by `origin`. */
export async function listDrafts(scope: SurveyScope): Promise<WithOrigin<SurveyDraft>[]> {
  const ids = (await openJson<string[]>(scope, DRAFTS)) ?? [];
  const drafts = await Promise.all(ids.map((id) => openJson<SurveyDraft>(scope, draftName(id))));
  const ledger = await readOriginLedger(scope);
  return drafts.filter((draft): draft is SurveyDraft => Boolean(draft)).map((draft) => ({ ...draft, origin: draftOrigin(draft, ledger) }));
}

export async function loadDraft(scope: SurveyScope, id: string): Promise<WithOrigin<SurveyDraft> | null> {
  const draft = await openJson<SurveyDraft>(scope, draftName(id));
  return draft ? { ...draft, origin: draftOrigin(draft, await readOriginLedger(scope)) } : null;
}

/**
 * A new draft must name its origin; an existing one keeps the origin it has
 * (stored or classified), and an attempt to save it under another origin --
 * or with audio from another origin -- is refused: relabelling is how a
 * record would reach the wrong server.
 */
export async function saveDraft(scope: SurveyScope, draft: SurveyDraft): Promise<void> {
  const existing = await openJson<SurveyDraft>(scope, draftName(draft.id));
  const origin = existing ? draftOrigin(existing, await readOriginLedger(scope)) : requireOrigin(draft.origin);
  if (draft.origin !== undefined && draft.origin !== origin) throw new OriginMismatchError("A draft cannot change origin.");
  if (draft.audio?.origin !== undefined && draft.audio.origin !== origin) throw new OriginMismatchError("A draft's audio must come from the draft's own origin.");
  await sealJson(scope, draftName(draft.id), { ...draft, origin, updatedAt: new Date().toISOString() });
  const ids = (await openJson<string[]>(scope, DRAFTS)) ?? [];
  if (!ids.includes(draft.id)) await sealJson(scope, DRAFTS, [...ids, draft.id]);
}

/** Removes the draft record only; its audio (if any) is handed to the outbox or deleted by the caller. */
export async function deleteDraft(scope: SurveyScope, id: string): Promise<void> {
  await removeItem(scope, draftName(id));
  const ids = (await openJson<string[]>(scope, DRAFTS)) ?? [];
  await sealJson(scope, DRAFTS, ids.filter((value) => value !== id));
}

/** Audio applies only to interviews whose version records audio, and only with accepted consent. */
export function audioApplies(version: SurveyVersion, respondentType: RespondentType): boolean {
  return respondentType === "interviewed_external" && version.audio_mode !== "none";
}

/**
 * Contract (API #51): audio_mode "required" never overrides a declined consent
 * -- that interview is sent without audio and flagged for staff. But once the
 * person ACCEPTED, a required interview is not complete without its audio:
 * it stays a draft (never sent as complete, never downgraded to optional).
 */
export function requiredAudioMissing(version: SurveyVersion, draft: Pick<SurveyDraft, "respondentType" | "consentAudio" | "audio">): boolean {
  return audioApplies(version, draft.respondentType) && version.audio_mode === "required" && draft.consentAudio === "accepted" && !draft.audio;
}

/** A required-audio interview needs an explicit consent decision; no answer is never read as a decline. */
export function consentDecisionMissing(version: SurveyVersion, draft: Pick<SurveyDraft, "respondentType" | "consentAudio">): boolean {
  return audioApplies(version, draft.respondentType) && version.audio_mode === "required" && draft.consentAudio === null;
}

function isEmpty(value: DraftValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

const TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/;

/** A number answer is kept as typed ("7.", "7,5") and only parsed when validated or sent. */
function numberText(value: DraftValue | undefined): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return value.trim().replace(",", ".");
  return null;
}

/**
 * Spanish error for one answer, or null when acceptable. Ranges are
 * client-side only (the server never rejects out-of-range values by design).
 * `requireAnswers` false skips the "required" check (interviews may be saved
 * incomplete; missing answers are sent as skipped).
 */
export function validateAnswer(question: SurveyQuestion, value: DraftValue | undefined, requireAnswers = true): string | null {
  const copy = strings.surveys.validation;
  if (isEmpty(value)) return question.required && requireAnswers ? copy.required : null;
  switch (question.type) {
    case "single_choice":
      return Array.isArray(value) && value.length === 1 && question.options.some((option) => option.id === value[0]) ? null : copy.chooseOne;
    case "multiple_choice":
      return Array.isArray(value) && value.every((id) => question.options.some((option) => option.id === id)) ? null : copy.chooseValid;
    case "scale": {
      const min = question.scale_min ?? 1;
      const max = question.scale_max ?? 5;
      return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? null : copy.scale(min, max);
    }
    case "number": {
      const raw = numberText(value);
      if (raw === null || !TWO_DECIMALS.test(raw)) return copy.number;
      const parsed = Number(raw);
      if (question.number_min !== null && parsed < question.number_min) return copy.numberRange(question.number_min, question.number_max);
      if (question.number_max !== null && parsed > question.number_max) return copy.numberRange(question.number_min, question.number_max);
      return null;
    }
    case "text":
      return typeof value === "string" && value.trim().length <= 2000 ? null : copy.tooLong;
    default:
      return copy.unsupported;
  }
}

export function validateAll(version: SurveyVersion, answers: Record<number, DraftValue>, requireAnswers = true): Record<number, string> {
  const errors: Record<number, string> = {};
  for (const question of version.questions) {
    const error = validateAnswer(question, answers[question.id], requireAnswers);
    if (error) errors[question.id] = error;
  }
  return errors;
}

/** Required questions left unanswered (an interview may still be saved; they go as skipped). */
export function missingRequired(version: SurveyVersion, answers: Record<number, DraftValue>): SurveyQuestion[] {
  return version.questions.filter((question) => question.required && isEmpty(answers[question.id]));
}

/** One typed answer per question, as the contract expects; anything unanswered is explicitly skipped. */
export function toSubmissionAnswers(version: SurveyVersion, answers: Record<number, DraftValue>): SurveyAnswer[] {
  return version.questions.map((question) => {
    const value = answers[question.id];
    if (isEmpty(value)) return { question_id: question.id, skipped: true };
    switch (question.type) {
      case "single_choice":
      case "multiple_choice":
        return { question_id: question.id, value_choice_ids: value as number[] };
      case "text":
        return { question_id: question.id, value_text: (value as string).trim() };
      case "number":
        return { question_id: question.id, value_number: Number(numberText(value)) };
      default:
        return { question_id: question.id, value_number: value as number };
    }
  });
}
