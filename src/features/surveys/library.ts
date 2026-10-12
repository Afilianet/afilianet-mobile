import { strings } from "../../i18n";
import type { SurveySource } from "./source";
import type { AnswerValue, SurveyAnswer, SurveyAssignment, SurveyModality, SurveyQuestion, SurveyVersion } from "./types";
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
  assignments: SurveyAssignment[];
  fetchedAt: string;
}

export interface DraftAudio {
  clientAudioId: string;
  mimeType: string;
  durationMs: number;
  interrupted: boolean;
  bytes: number;
}

export interface SurveyDraft {
  id: string;
  surveyId: string;
  versionId: string;
  surveyTitle: string;
  modality: SurveyModality;
  respondentLabel: string | null;
  answers: Record<string, AnswerValue>;
  /** null until the consent step was answered; false means "without recording". */
  recordingConsent: boolean | null;
  audio: DraftAudio | null;
  updatedAt: string;
}

const versionName = (surveyId: string) => `version-${surveyId}`;
const draftName = (id: string) => `draft-${id}`;
const INBOX = "inbox";
const DRAFTS = "drafts";

export async function downloadVersion(scope: SurveyScope, source: SurveySource, assignment: SurveyAssignment): Promise<DownloadedVersion> {
  const version = await source.getVersion(scope.organizationId, assignment.survey_id, assignment.current_version_id);
  const downloaded: DownloadedVersion = { version, downloadedAt: new Date().toISOString() };
  await sealJson(scope, versionName(assignment.survey_id), downloaded);
  return downloaded;
}

export async function getDownloaded(scope: SurveyScope, surveyId: string): Promise<DownloadedVersion | null> {
  return openJson<DownloadedVersion>(scope, versionName(surveyId));
}

export async function removeDownloaded(scope: SurveyScope, surveyId: string): Promise<void> {
  await removeItem(scope, versionName(surveyId));
}

/** Fetches the inbox and remembers it, so it can still be shown (read-only) offline. */
export async function refreshInbox(scope: SurveyScope, source: SurveySource): Promise<CachedInbox> {
  const inbox: CachedInbox = { assignments: await source.listAssignments(scope.organizationId), fetchedAt: new Date().toISOString() };
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

function isEmpty(value: AnswerValue | undefined): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Spanish error for one answer, or null when it is acceptable. */
export function validateAnswer(question: SurveyQuestion, value: AnswerValue | undefined): string | null {
  const copy = strings.surveys.validation;
  if (isEmpty(value)) return question.required ? copy.required : null;
  switch (question.type) {
    case "single_choice":
      return typeof value === "string" && question.options.some((option) => option.id === value) ? null : copy.chooseOne;
    case "multiple_choice":
      return Array.isArray(value) && value.every((id) => question.options.some((option) => option.id === id)) ? null : copy.chooseValid;
    case "scale": {
      const min = question.scale?.min ?? 1;
      const max = question.scale?.max ?? 5;
      return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? null : copy.scale(min, max);
    }
    case "open_text":
      return typeof value === "string" && value.trim().length <= 2000 ? null : copy.tooLong;
    default:
      return copy.unsupported;
  }
}

export function validateAll(version: SurveyVersion, answers: Record<string, AnswerValue>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of version.questions) {
    const error = validateAnswer(question, answers[question.id]);
    if (error) errors[question.id] = error;
  }
  return errors;
}

export function toSubmissionAnswers(version: SurveyVersion, answers: Record<string, AnswerValue>): SurveyAnswer[] {
  return version.questions.map((question) => {
    const value = answers[question.id];
    return { question_id: question.id, value: typeof value === "string" ? value.trim() || null : value ?? null };
  });
}
