import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { SurveysPreviewNotice } from "../../features/surveys/components";
import {
  cachedInbox,
  deleteDraft,
  downloadVersion,
  getDownloaded,
  listDrafts,
  removeDownloaded,
  saveDraft,
  type DownloadedVersion,
  type SurveyDraft,
} from "../../features/surveys/library";
import { audioName, newClientId } from "../../features/surveys/outbox";
import { surveySource, useSurveyScope } from "../../features/surveys/runtime";
import type { SurveyAssignment } from "../../features/surveys/types";
import { removeItem, scopeId, StorageFullError } from "../../features/surveys/vault";
import { accessErrorMessage } from "../../api/access";
import { strings } from "../../i18n";
import { surveyResponse } from "../../navigation/routes";
import { formatDateTime } from "../../utils/date";

export default function SurveyDetailScreen() {
  const router = useRouter();
  const { surveyId } = useLocalSearchParams<{ surveyId: string }>();
  const scope = useSurveyScope();
  const copy = strings.surveys;
  const [assignment, setAssignment] = useState<SurveyAssignment | null | undefined>(undefined);
  const [downloaded, setDownloaded] = useState<DownloadedVersion | null>(null);
  const [drafts, setDrafts] = useState<SurveyDraft[]>([]);
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
    const [inbox, version, allDrafts] = await Promise.all([cachedInbox(scope), getDownloaded(scope, surveyId), listDrafts(scope)]);
    if (key !== currentScope.current) return;
    setAssignment(inbox?.assignments.find((value) => value.survey_id === surveyId) ?? null);
    setDownloaded(version);
    setDrafts(allDrafts.filter((draft) => draft.surveyId === surveyId));
  }, [scope, surveyId]);

  useEffect(() => {
    void load();
  }, [load, scopeKey]);

  async function download() {
    if (!scope || !assignment) return;
    setBusy(true);
    setError(null);
    try {
      await downloadVersion(scope, surveySource, assignment);
      await load();
    } catch (cause) {
      setError(cause instanceof StorageFullError ? cause.message : accessErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!scope || !downloaded || !assignment) return;
    const draft: SurveyDraft = {
      id: newClientId(),
      surveyId: downloaded.version.survey_id,
      versionId: downloaded.version.id,
      surveyTitle: downloaded.version.title,
      modality: downloaded.version.modality,
      respondentLabel: null,
      answers: {},
      recordingConsent: downloaded.version.recording.enabled && downloaded.version.modality === "interviewer" ? null : false,
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
      { text: strings.surveys.signOut.cancel, style: "cancel" },
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
    if (surveySource.kind !== "fixture" || !assignment) return;
    await (surveySource as unknown as { setClosed(id: string, closed: boolean): Promise<void> }).setClosed(assignment.survey_id, closed);
    setAssignment({ ...assignment, status: closed ? "closed" : "open" });
  }

  if (assignment === undefined) return <SkeletonGroup lines={4} />;
  if (assignment === null) return <EmptyState title={copy.title} description={copy.noCachedInbox} />;

  const closed = assignment.status === "closed";
  const outdated = downloaded && downloaded.version.id !== assignment.current_version_id;
  const interview = assignment.modality === "interviewer";
  const canStart = Boolean(downloaded) && !closed && (!interview || assignment.interviewer_authorized);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="survey-detail-scroll">
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">{assignment.title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
        <SurveysPreviewNotice />
        <View style={styles.row}>
          <Badge label={copy.status[assignment.status]} tone={closed ? "neutral" : "success"} />
          <Text style={styles.meta}>{`${copy.modality[assignment.modality]} · ${copy.version(assignment.current_version)}`}</Text>
        </View>

        <Card style={styles.card}>
          {downloaded && !outdated ? <Text style={styles.offline}>{copy.availableOffline(formatDateTime(downloaded.downloadedAt))}</Text> : null}
          {outdated ? <Text style={styles.body}>{copy.outdatedDownload(downloaded.version.version, assignment.current_version)}</Text> : null}
          {!downloaded ? <Text style={styles.body}>{copy.notDownloaded}</Text> : null}
          {!closed && (!downloaded || outdated) ? <Button label={copy.download} variant="secondary" loading={busy} onPress={() => void download()} /> : null}
          {downloaded && drafts.length === 0 ? (
            <Button
              label={copy.removeDownload}
              variant="ghost"
              size="sm"
              onPress={() => void (scope ? removeDownloaded(scope, assignment.survey_id).then(load) : undefined)}
            />
          ) : null}
        </Card>

        {closed ? <Text style={styles.body}>{copy.closedCannotStart}</Text> : null}
        {interview && !assignment.interviewer_authorized ? <Text style={styles.body}>{copy.notInterviewer}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button label={interview ? copy.startInterview : copy.answerMyself} disabled={!canStart} onPress={() => void start()} />

        {drafts.length ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{copy.drafts}</Text>
            {drafts.map((draft) => (
              <View key={draft.id} style={styles.draft}>
                <Button label={copy.resumeDraft(formatDateTime(draft.updatedAt))} variant="secondary" size="sm" onPress={() => router.push(surveyResponse(draft.id) as never)} />
                <Button label={copy.discardDraft} variant="ghost" size="sm" onPress={() => discard(draft)} />
              </View>
            ))}
          </Card>
        ) : null}

        {surveySource.kind === "fixture" ? (
          <Button
            label={closed ? copy.fixture.reopenSurvey : copy.fixture.closeSurvey}
            variant="ghost"
            size="sm"
            onPress={() => void setFixtureClosed(!closed)}
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
  draft: { gap: spacing.xs },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  offline: { ...typography.body, color: colors.success },
  error: { ...typography.body, color: colors.danger },
});
