import { strings } from "../../i18n";
import type { SurveySource } from "./source";
import type { AvailableSurvey, ConsentAudio, RespondentType, SurveyAnswer, SurveyQuestion, SurveyVersion } from "./types";
import { openJson, removeItem, sealJson, type SurveyScope } from "./vault";

/**
 * What a person can use WITHOUT a connection, per account+organization:
 * questionnaire versions they explicitly downloaded, the last inbox they
 * saw, and their drafts. Offline capture is only possible for a downloaded
 * version -- nothing is fetched lazily mid-survey.
 */

export interface DownloadedVersion {
  version: SurveyVersion;
  downloadedAt: string;
}

export interface CachedInbox {
  surveys: AvailableSurvey[];
  fetchedAt: string;
}

export interface DraftAudio {
  /** Local only: names the sealed file on this phone. */
  clientAudioId: string;
  mimeType: string;
  durationMs: number;
  interrupted: boolean;
  bytes: number;
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
}

const versionName = (surveyId: string) => `version-${surveyId}`;
const draftName = (id: string) => `draft-${id}`;
const INBOX = "inbox";
const DRAFTS = "drafts";

export async function downloadVersion(scope: SurveyScope, source: SurveySource, available: AvailableSurvey): Promise<DownloadedVersion> {
  const version = await source.getVersion(scope.organizationId, available.id);
  const downloaded: DownloadedVersion = { version, downloadedAt: new Date().toISOString() };
  await sealJson(scope, versionName(available.survey_id), downloaded);
  return downloaded;
}

export async function getDownloaded(scope: SurveyScope, surveyId: string): Promise<DownloadedVersion | null> {
  return openJson<DownloadedVersion>(scope, versionName(surveyId));
}

export async function removeDownloaded(scope: SurveyScope, surveyId: string): Promise<void> {
  await removeItem(scope, versionName(surveyId));
}

/** Fetches the inbox (open versions only) and remembers it, so it can be shown offline. */
export async function refreshInbox(scope: SurveyScope, source: SurveySource): Promise<CachedInbox> {
  const inbox: CachedInbox = { surveys: await source.listAvailable(scope.organizationId), fetchedAt: new Date().toISOString() };
  await sealJson(scope, INBOX, inbox);
  return inbox;
}

export async function cachedInbox(scope: SurveyScope): Promise<CachedInbox | null> {
  return openJson<CachedInbox>(scope, INBOX);
}

export async function listDrafts(scope: SurveyScope): Promise<SurveyDraft[]> {
  const ids = (await openJson<string[]>(scope, DRAFTS)) ?? [];
  const drafts = await Promise.all(ids.map((id) => openJson<SurveyDraft>(scope, draftName(id))));
  return drafts.filter((draft): draft is SurveyDraft => Boolean(draft));
}

export async function loadDraft(scope: SurveyScope, id: string): Promise<SurveyDraft | null> {
  return openJson<SurveyDraft>(scope, draftName(id));
}

export async function saveDraft(scope: SurveyScope, draft: SurveyDraft): Promise<void> {
  await sealJson(scope, draftName(draft.id), { ...draft, updatedAt: new Date().toISOString() });
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
