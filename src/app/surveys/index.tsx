import { useRouter } from "expo-router";
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
import { OutboxPanel, SurveysPreviewNotice } from "../../features/surveys/components";
import { cachedInbox, getDownloaded, refreshInbox, type DownloadedVersion } from "../../features/surveys/library";
import { surveySource, surveysPreviewEnabled, useSurveyScope } from "../../features/surveys/runtime";
import type { SurveyAssignment } from "../../features/surveys/types";
import { useSurveyOutbox } from "../../features/surveys/useSurveyOutbox";
import { scopeId } from "../../features/surveys/vault";
import { strings } from "../../i18n";
import { surveyDetail } from "../../navigation/routes";
import { formatDateTime } from "../../utils/date";

type InboxState =
  | { kind: "loading" }
  | { kind: "online"; assignments: SurveyAssignment[] }
  | { kind: "offline"; assignments: SurveyAssignment[]; fetchedAt: string }
  | { kind: "offline_empty" }
  | { kind: "error"; message: string };

export default function SurveysInboxScreen() {
  const router = useRouter();
  const scope = useSurveyScope();
  const outbox = useSurveyOutbox(scope);
  const copy = strings.surveys;
  const [loadedInbox, setLoadedInbox] = useState<{ key: string; inbox: InboxState; downloads: Record<string, DownloadedVersion | null> } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
      next = { kind: "online", assignments: (await refreshInbox(scope, surveySource)).assignments };
    } catch (error) {
      const offline = isApiError(error) && (error.kind === "offline" || error.kind === "timeout");
      const cached = await cachedInbox(scope);
      next = cached
        ? { kind: "offline", assignments: cached.assignments, fetchedAt: cached.fetchedAt }
        : offline
          ? { kind: "offline_empty" }
          : { kind: "error", message: strings.shared.genericError };
    }
    const assignments = "assignments" in next ? next.assignments : [];
    const entries = await Promise.all(assignments.map(async (assignment) => [assignment.survey_id, await getDownloaded(scope, assignment.survey_id)] as const));
    // A switch of account/organization while loading must not show the previous one's list.
    if (key !== currentScope.current) return;
    setLoadedInbox({ key, inbox: next, downloads: Object.fromEntries(entries) });
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load, scopeKey]);

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

  const assignments = inbox.kind === "online" || inbox.kind === "offline" ? inbox.assignments : [];

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

        <OutboxPanel
          items={outbox.items}
          receipts={outbox.receipts}
          syncing={outbox.syncing}
          progress={outbox.progress}
          message={outbox.message}
          onSync={() => void outbox.sync(true)}
          onDiscard={(id) => void outbox.discard(id)}
        />

        {inbox.kind === "loading" ? <SkeletonGroup lines={3} /> : null}
        {inbox.kind === "offline" ? <Text style={styles.notice}>{copy.offlineInbox(formatDateTime(inbox.fetchedAt))}</Text> : null}
        {inbox.kind === "offline_empty" ? <Text style={styles.notice}>{copy.noCachedInbox}</Text> : null}
        {inbox.kind === "error" ? <Text accessibilityRole="alert" style={styles.error}>{inbox.message}</Text> : null}
        {(inbox.kind === "online" || inbox.kind === "offline") && assignments.length === 0 ? <Text style={styles.body}>{copy.inboxEmpty}</Text> : null}

        {assignments.map((assignment) => {
          const downloaded = downloads[assignment.survey_id];
          const outdated = downloaded && downloaded.version.id !== assignment.current_version_id;
          const destination = surveyDetail(assignment.survey_id);
          return (
            <Card key={assignment.survey_id} style={styles.card} testID={`survey-${assignment.survey_id}`}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{assignment.title}</Text>
                <Badge label={copy.status[assignment.status]} tone={assignment.status === "open" ? "success" : "neutral"} />
              </View>
              <Text style={styles.meta}>{`${copy.modality[assignment.modality]} · ${copy.version(assignment.current_version)}`}</Text>
              {downloaded && !outdated ? <Text style={styles.offline}>{copy.availableOffline(formatDateTime(downloaded.downloadedAt))}</Text> : null}
              {outdated ? <Text style={styles.notice}>{copy.outdatedDownload(downloaded.version.version, assignment.current_version)}</Text> : null}
              {!downloaded && assignment.status === "open" ? <Text style={styles.meta}>{copy.notDownloaded}</Text> : null}
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
