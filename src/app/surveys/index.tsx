import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { DraftRow, OtherOriginsPanel, OutboxPanel, SurveysPreviewNotice } from "../../features/surveys/components";
import { cachedInbox, getDownloaded, listDrafts, refreshInbox, type DownloadedVersion, type SurveyDraft } from "../../features/surveys/library";
import { surveySource, surveysPreviewEnabled, useSurveyScope } from "../../features/surveys/runtime";
import type { AvailableSurvey } from "../../features/surveys/types";
import { useSurveyOutbox } from "../../features/surveys/useSurveyOutbox";
import { scopeId } from "../../features/surveys/vault";
import { strings } from "../../i18n";
import { surveyDetail, surveyResponse } from "../../navigation/routes";
import { formatDateTime } from "../../utils/date";

type InboxState =
  | { kind: "loading" }
  | { kind: "online"; surveys: AvailableSurvey[] }
  | { kind: "offline"; surveys: AvailableSurvey[]; fetchedAt: string }
  | { kind: "offline_empty" }
  | { kind: "error"; message: string };

export default function SurveysInboxScreen() {
  const router = useRouter();
  const scope = useSurveyScope();
  const outbox = useSurveyOutbox(scope);
  const copy = strings.surveys;
  const [loadedInbox, setLoadedInbox] = useState<{ key: string; inbox: InboxState; downloads: Record<string, DownloadedVersion | null> } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedDrafts, setLoadedDrafts] = useState<{
    key: string;
    drafts: { draft: SurveyDraft; version: DownloadedVersion["version"] | null }[];
    others: (SurveyDraft & { origin: string })[];
  } | null>(null);
  const scopeKey = scope ? scopeId(scope) : null;
  const currentScope = useRef(scopeKey);
  useEffect(() => {
    currentScope.current = scopeKey;
  }, [scopeKey]);

  const load = useCallback(async () => {
    if (!scope) return;
    const key = scopeId(scope);
    let next: InboxState;
    try {
      next = { kind: "online", surveys: (await refreshInbox(scope, surveySource)).surveys };
    } catch (error) {
      const offline = isApiError(error) && (error.kind === "offline" || error.kind === "timeout");
      // Only this origin's saved list: another origin's is never shown as this one's.
      const cached = await cachedInbox(scope, surveySource.origin);
      next = cached
        ? { kind: "offline", surveys: cached.surveys, fetchedAt: cached.fetchedAt }
        : offline
          ? { kind: "offline_empty" }
          : { kind: "error", message: strings.shared.genericError };
    }
    const listed = "surveys" in next ? next.surveys : [];
    const entries = await Promise.all(listed.map(async (survey) => [survey.survey_id, await getDownloaded(scope, survey.survey_id, surveySource.origin)] as const));
    // A switch of account/organization while loading must not show the previous one's list.
    if (key !== currentScope.current) return;
    setLoadedInbox({ key, inbox: next, downloads: Object.fromEntries(entries) });
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load, scopeKey]);

  // Drafts never leave the phone: listed from local storage only, so coming
  // back from a response (the stack keeps this screen mounted) shows them.
  // Another origin's (or an unconfirmed) draft is listed apart, view only.
  const loadDrafts = useCallback(async () => {
    if (!scope) return;
    const key = scopeId(scope);
    const all = await listDrafts(scope);
    const own = all.filter((draft) => draft.origin === surveySource.origin);
    const withVersion = await Promise.all(
      own.map(async (draft) => {
        const downloaded = await getDownloaded(scope, draft.surveyId, surveySource.origin);
        return { draft, version: downloaded && downloaded.version.id === draft.versionId ? downloaded.version : null };
      }),
    );
    if (key !== currentScope.current) return;
    setLoadedDrafts({ key, drafts: withVersion, others: all.filter((draft) => draft.origin !== surveySource.origin) });
  }, [scope]);

  const reloadOutbox = outbox.reload;
  useFocusEffect(
    useCallback(() => {
      void Promise.resolve().then(loadDrafts);
      void reloadOutbox();
    }, [loadDrafts, reloadOutbox]),
  );
  const drafts = loadedDrafts && loadedDrafts.key === scopeKey ? loadedDrafts.drafts : [];
  const otherDrafts = loadedDrafts && loadedDrafts.key === scopeKey ? loadedDrafts.others : [];

  // Keyed by scope: another account's or organization's list is never rendered, not even briefly.
  const inbox: InboxState = loadedInbox && loadedInbox.key === scopeKey ? loadedInbox.inbox : { kind: "loading" };
  const downloads = loadedInbox && loadedInbox.key === scopeKey ? loadedInbox.downloads : {};

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([load(), outbox.sync(true)]);
    } finally {
      setRefreshing(false);
    }
  }

  if (!surveysPreviewEnabled) {
    return <EmptyState title={copy.title} description={copy.inboxEmpty} />;
  }

  const surveys = inbox.kind === "online" || inbox.kind === "offline" ? inbox.surveys : [];

  return (
    <View style={styles.screen}>
      <ScrollView
        testID="surveys-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">{copy.title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
        <SurveysPreviewNotice />
        <Text style={styles.meta}>{copy.pushNote}</Text>

        {drafts.length ? (
          <Card style={styles.card} testID="survey-drafts">
            <Text style={styles.cardTitle}>{copy.drafts}</Text>
            {drafts.map(({ draft, version }) => (
              <DraftRow key={draft.id} draft={draft} version={version} onContinue={() => router.push(surveyResponse(draft.id) as never)} />
            ))}
          </Card>
        ) : null}

        <OutboxPanel
          items={outbox.items}
          receipts={outbox.receipts}
          syncing={outbox.syncing}
          progress={outbox.progress}
          message={outbox.message}
          onSync={() => void outbox.sync(true)}
          onDiscard={(id) => void outbox.discard(id)}
          onDiscardAudio={(id) => void outbox.discardAudio(id)}
        />

        <OtherOriginsPanel
          activeOrigin={surveySource.origin}
          items={outbox.otherItems}
          drafts={otherDrafts}
          receipts={outbox.otherReceipts}
          onViewDraft={(id) => router.push(surveyResponse(id) as never)}
        />

        {inbox.kind === "loading" ? <SkeletonGroup lines={3} /> : null}
        {inbox.kind === "offline" ? <Text style={styles.notice}>{copy.offlineInbox(formatDateTime(inbox.fetchedAt))}</Text> : null}
        {inbox.kind === "offline_empty" ? <Text style={styles.notice}>{copy.noCachedInbox}</Text> : null}
        {inbox.kind === "error" ? <Text accessibilityRole="alert" style={styles.error}>{inbox.message}</Text> : null}
        {(inbox.kind === "online" || inbox.kind === "offline") && surveys.length === 0 ? <Text style={styles.body}>{copy.inboxEmpty}</Text> : null}

        {surveys.map((survey) => {
          const downloaded = downloads[survey.survey_id];
          const outdated = downloaded && downloaded.version.id !== survey.id;
          const destination = surveyDetail(survey.survey_id);
          const modes = [
            survey.allows_self_response ? copy.availability.self : null,
            survey.allows_interview_response && survey.is_assigned_surveyor ? copy.availability.interview : null,
          ].filter(Boolean).join(" · ");
          return (
            <Card key={survey.survey_id} style={styles.card} testID={`survey-${survey.survey_id}`}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{survey.title}</Text>
                <Badge label={copy.status.open} tone="success" />
              </View>
              <Text style={styles.meta}>{[modes, copy.version(survey.version_number)].filter(Boolean).join(" · ")}</Text>
              {downloaded && !outdated ? <Text style={styles.offline}>{copy.availableOffline(formatDateTime(downloaded.downloadedAt))}</Text> : null}
              {outdated ? <Text style={styles.notice}>{copy.outdatedDownload(downloaded.version.version_number, survey.version_number)}</Text> : null}
              {!downloaded ? <Text style={styles.meta}>{copy.notDownloaded}</Text> : null}
              {destination ? <Button label={copy.open} variant="secondary" size="sm" onPress={() => router.push(destination as never)} /> : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { ...typography.title, color: colors.textPrimary },
  card: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  offline: { ...typography.caption, color: colors.success },
  notice: { ...typography.body, color: colors.textPrimary },
  error: { ...typography.body, color: colors.danger },
});
