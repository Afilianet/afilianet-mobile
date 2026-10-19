import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage } from "../../api/access";
import { isApiError } from "../../api/errors";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { DraftRow, SurveysPreviewNotice } from "../../features/surveys/components";
import {
  cachedInbox,
  deleteDraft,
  downloadVersion,
  getDownloaded,
  listDrafts,
  refreshInbox,
  removeDownloaded,
  saveDraft,
  type DownloadedVersion,
  type SurveyDraft,
} from "../../features/surveys/library";
import { audioName, newClientId } from "../../features/surveys/outbox";
import { surveySource, useSurveyScope } from "../../features/surveys/runtime";
import type { AvailableSurvey, RespondentType } from "../../features/surveys/types";
import { removeItem, scopeId, StorageFullError } from "../../features/surveys/vault";
import { strings } from "../../i18n";
import { surveyResponse } from "../../navigation/routes";
import { formatDateTime } from "../../utils/date";

interface Loaded {
  key: string;
  /** null when the last inbox no longer lists it (closed, superseded or archived). */
  available: AvailableSurvey | null;
  inboxKnown: boolean;
  downloaded: DownloadedVersion | null;
  drafts: SurveyDraft[];
}

export default function SurveyDetailScreen() {
  const router = useRouter();
  const { surveyId } = useLocalSearchParams<{ surveyId: string }>();
  const scope = useSurveyScope();
  const copy = strings.surveys;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = scope ? scopeId(scope) : null;
  const currentScope = useRef(scopeKey);
  useEffect(() => {
    currentScope.current = scopeKey;
  }, [scopeKey]);

  const load = useCallback(async () => {
    if (!scope || !surveyId) return;
    const key = scopeId(scope);
    const [inbox, downloaded, allDrafts] = await Promise.all([cachedInbox(scope), getDownloaded(scope, surveyId), listDrafts(scope)]);
    if (key !== currentScope.current) return;
    setLoaded({
      key,
      available: inbox?.surveys.find((value) => value.survey_id === surveyId) ?? null,
      inboxKnown: Boolean(inbox),
      downloaded,
      drafts: allDrafts.filter((draft) => draft.surveyId === surveyId),
    });
  }, [scope, surveyId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, scopeKey]);
  // The stack keeps this screen mounted under the response screen: coming
  // back must show the draft just created, edited or sent.
  useFocusEffect(
    useCallback(() => {
      void Promise.resolve().then(load);
    }, [load]),
  );

  // Keyed by scope: another account's or organization's data is never rendered.
  const current = loaded && loaded.key === scopeKey ? loaded : null;
  if (!current) return <SkeletonGroup lines={4} />;
  const { available, inboxKnown, downloaded, drafts } = current;
  if (!available && !downloaded) return <EmptyState title={copy.title} description={inboxKnown ? copy.notAvailableAnymore : copy.noCachedInbox} />;

  const version = downloaded?.version ?? null;
  const outdated = Boolean(available && downloaded && downloaded.version.id !== available.id);
  const open = Boolean(available) && !outdated;
  const allowsSelf = version?.allows_self_response ?? available?.allows_self_response ?? false;
  const allowsInterview = version?.allows_interview_response ?? available?.allows_interview_response ?? false;
  const assigned = available?.is_assigned_surveyor ?? false;
  const title = available?.title ?? version?.title ?? copy.title;

  async function download() {
    if (!scope || !available) return;
    setBusy(true);
    setError(null);
    try {
      await downloadVersion(scope, surveySource, available);
      await load();
    } catch (cause) {
      setError(cause instanceof StorageFullError ? cause.message : accessErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function start(respondentType: RespondentType) {
    if (!scope || busy) return;
    let version = downloaded && !outdated ? downloaded.version : null;
    if (!version) {
      // Online, «Responder» prepares the download itself; offline without a
      // local copy there is nothing to answer from, and the screen says why.
      if (!available) return;
      setBusy(true);
      setError(null);
      try {
        version = (await downloadVersion(scope, surveySource, available)).version;
        await load();
      } catch (cause) {
        const offline = isApiError(cause) && (cause.kind === "offline" || cause.kind === "timeout");
        setError(cause instanceof StorageFullError ? cause.message : offline ? copy.notDownloadedOffline : accessErrorMessage(cause));
        return;
      } finally {
        setBusy(false);
      }
    }
    const draft: SurveyDraft = {
      id: newClientId(),
      surveyId: version.survey_id,
      versionId: version.id,
      surveyTitle: version.title,
      respondentType,
      answers: {},
      consentAudio: null,
      audio: null,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveDraft(scope, draft);
      router.push(surveyResponse(draft.id) as never);
    } catch (cause) {
      setError(cause instanceof StorageFullError ? cause.message : copy.storageFull);
    }
  }

  function discard(draft: SurveyDraft) {
    if (!scope) return;
    Alert.alert(copy.discardDraft, copy.discardDraftConfirm, [
      { text: copy.signOut.cancel, style: "cancel" },
      {
        text: copy.discardDraft,
        style: "destructive",
        onPress: () =>
          void (async () => {
            if (draft.audio) await removeItem(scope, audioName(draft.audio.clientAudioId));
            await deleteDraft(scope, draft.id);
            await load();
          })(),
      },
    ]);
  }

  async function setFixtureClosed(closed: boolean) {
    const versionId = available?.id ?? version?.id;
    if (surveySource.kind !== "fixture" || !versionId) return;
    await (surveySource as unknown as { setClosed(id: string, closed: boolean): Promise<void> }).setClosed(versionId, closed);
    // Online the inbox reflects it; offline the phone keeps not knowing ("closed while offline").
    if (scope) await refreshInbox(scope, surveySource).catch(() => null);
    await load();
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="survey-detail-scroll">
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">{title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
        <SurveysPreviewNotice />
        <View style={styles.row}>
          <Badge label={open ? copy.status.open : copy.status.closed} tone={open ? "success" : "neutral"} />
          {version ? <Text style={styles.meta}>{copy.version(version.version_number)}</Text> : null}
        </View>
        {!available && inboxKnown ? <Text style={styles.body}>{copy.notAvailableAnymore}</Text> : null}

        <Card style={styles.card}>
          {downloaded && !outdated ? <Text style={styles.offline}>{copy.availableOffline(formatDateTime(downloaded.downloadedAt))}</Text> : null}
          {outdated && downloaded && available ? (
            <Text style={styles.body}>{copy.outdatedDownload(downloaded.version.version_number, available.version_number)}</Text>
          ) : null}
          {!downloaded ? <Text style={styles.body}>{copy.notDownloaded}</Text> : null}
          {available && (!downloaded || outdated) ? <Button label={copy.download} variant="secondary" loading={busy} onPress={() => void download()} /> : null}
          {downloaded && drafts.length === 0 ? (
            <Button
              label={copy.removeDownload}
              variant="ghost"
              size="sm"
              onPress={() => void (scope ? removeDownloaded(scope, downloaded.version.survey_id).then(load) : undefined)}
            />
          ) : null}
        </Card>

        {allowsInterview && !assigned ? <Text style={styles.body}>{copy.notInterviewer}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {allowsSelf ? <Button label={copy.answerMyself} disabled={!open} loading={busy} onPress={() => void start("self")} /> : null}
        {allowsInterview && assigned ? (
          <Button label={copy.startInterview} variant={allowsSelf ? "secondary" : "primary"} disabled={!open} loading={busy} onPress={() => void start("interviewed_external")} />
        ) : null}

        {drafts.length ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{copy.drafts}</Text>
            {drafts.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                version={downloaded && downloaded.version.id === draft.versionId ? downloaded.version : null}
                onContinue={() => router.push(surveyResponse(draft.id) as never)}
                onDiscard={() => discard(draft)}
              />
            ))}
          </Card>
        ) : null}

        {surveySource.kind === "fixture" ? (
          <Button
            label={available ? copy.fixture.closeSurvey : copy.fixture.reopenSurvey}
            variant="ghost"
            size="sm"
            onPress={() => void setFixtureClosed(Boolean(available))}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  heading: { ...typography.title, color: colors.textPrimary, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  card: { gap: spacing.sm },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  offline: { ...typography.body, color: colors.success },
  error: { ...typography.body, color: colors.danger },
});
