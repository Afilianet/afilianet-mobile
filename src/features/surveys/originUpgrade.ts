import { DRAFTS, draftName, INBOX, versionName, type CachedInbox, type DownloadedVersion, type SurveyDraft } from "./library";
import { addToOriginLedger, ledgerKey, legacyInboxOrigin, legacyOrigin, readOriginLedger, UNCONFIRMED_ORIGIN, type LegacyOrigin } from "./origin";
import { OUTBOX, RECEIPTS, type OutboxItem, type OutboxReceipt } from "./outbox";
import { listScopes, openJson, type SurveyScope } from "./vault";

/**
 * Classifies, once, the records an account+organization stored before
 * origins existed (docs/AISLAMIENTO_ORIGEN_ENCUESTAS_ES.md):
 *
 * - "fixture" only with unequivocal evidence: the exact historical sample
 *   survey/version id pairs (origin.ts);
 * - everything else "unconfirmed": kept, shown apart, never sent
 *   automatically. A UUID alone does not prove staging or production.
 *
 * It writes ONE new file (the ledger) and never rewrites, moves or deletes a
 * record, its answers or its audio. It only adds entries that are missing, so
 * running it again changes nothing; if it is interrupted, records read as
 * before (the same rules are applied live) and the next run finishes it.
 * Sending never depends on it having run.
 */
export async function upgradeLegacyOrigins(scope: SurveyScope): Promise<{ added: number }> {
  const ledger = await readOriginLedger(scope);
  const entries: Record<string, LegacyOrigin> = {};
  const add = (key: string, origin: LegacyOrigin) => {
    if (!(key in ledger) && !(key in entries)) entries[key] = origin;
  };
  const unreadable = async <T>(name: string): Promise<T | null> => openJson<T>(scope, name).catch(() => null);

  const surveyIds = new Set<string>();
  for (const id of (await unreadable<string[]>(DRAFTS)) ?? []) {
    const draft = await unreadable<SurveyDraft>(draftName(id));
    if (!draft) continue;
    surveyIds.add(draft.surveyId);
    if (draft.origin) continue;
    const origin = legacyOrigin(draft.surveyId, draft.versionId);
    add(ledgerKey.draft(draft.id), origin);
    if (draft.audio) add(ledgerKey.audio(draft.audio.clientAudioId), origin);
  }
  for (const item of (await unreadable<OutboxItem[]>(OUTBOX)) ?? []) {
    surveyIds.add(item.surveyId);
    if (item.origin) continue;
    const origin = legacyOrigin(item.surveyId, item.versionId);
    add(ledgerKey.outbox(item.id), origin);
    if (item.audio) add(ledgerKey.audio(item.audio.clientAudioId), origin);
  }
  for (const receipt of (await unreadable<OutboxReceipt[]>(RECEIPTS)) ?? []) {
    if (!receipt.origin) add(ledgerKey.receipt(receipt.id), UNCONFIRMED_ORIGIN);
  }
  const inbox = await unreadable<CachedInbox>(INBOX);
  if (inbox) {
    inbox.surveys?.forEach((survey) => surveyIds.add(survey.survey_id));
    if (!inbox.origin) add(ledgerKey.inbox, legacyInboxOrigin(inbox.surveys));
  }
  // Downloads have no index: the ones any known record or the inbox refers to.
  for (const surveyId of surveyIds) {
    const downloaded = await unreadable<DownloadedVersion>(versionName(surveyId)).catch(() => null);
    if (downloaded && !downloaded.origin) add(ledgerKey.version(surveyId), legacyOrigin(downloaded.version?.survey_id, downloaded.version?.id));
  }

  return { added: await addToOriginLedger(scope, entries) };
}

/** Every account+organization on the phone; one that fails is retried on the next run, the rest still finish. */
export async function upgradeAllLegacyOrigins(): Promise<{ scopes: number; failed: number }> {
  let failed = 0;
  const scopes = await listScopes();
  for (const scope of scopes) {
    await upgradeLegacyOrigins(scope).catch(() => {
      failed += 1;
    });
  }
  return { scopes: scopes.length, failed };
}
