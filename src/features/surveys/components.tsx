import { Alert, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, spacing, typography } from "../../components/ui/theme";
import type { BadgeTone } from "../../design-system/theme";
import { strings } from "../../i18n";
import { formatDateTime } from "../../utils/date";
import type { SurveyDraft } from "./library";
import { displayState, type OutboxDisplayState, type OutboxItem, type OutboxReceipt, type SyncProgress } from "./outbox";
import { surveySource } from "./runtime";
import type { SurveyVersion } from "./types";

/**
 * A draft on this phone: never sent, always editable. Labelled «Borrador»
 * with an explicit «Continuar» action so it is never mistaken for a saved
 * (sent) response, which lives in the outbox and is not editable.
 */
export function DraftRow({
  draft,
  version,
  onContinue,
  onDiscard,
}: {
  draft: SurveyDraft;
  /** The downloaded version, when known, to show how far the draft got. */
  version?: SurveyVersion | null;
  onContinue: () => void;
  onDiscard?: () => void;
}) {
  const copy = strings.surveys;
  const answered = Object.values(draft.answers).filter((value) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0)).length;
  const modality = draft.respondentType === "self" ? copy.availability.self : copy.availability.interview;
  return (
    <View style={styles.row} testID={`draft-${draft.id}`}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{draft.surveyTitle}</Text>
        <Badge label={copy.draftBadge} tone="warning" />
      </View>
      <Text style={styles.meta}>
        {`${copy.draftUpdated(formatDateTime(draft.updatedAt))} · ${modality}`}
        {version ? ` · ${copy.draftProgress(answered, version.questions.length)}` : ""}
      </Text>
      <Button label={copy.continueDraft} variant="secondary" size="sm" onPress={onContinue} />
      {onDiscard ? <Button label={copy.discardDraft} variant="ghost" size="sm" onPress={onDiscard} /> : null}
    </View>
  );
}

export function SurveysPreviewNotice() {
  if (surveySource.kind !== "fixture") return null;
  return (
    <Card style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeText}>{strings.surveys.previewNotice}</Text>
    </Card>
  );
}

const STATE_COPY: Record<OutboxDisplayState, { label: string; tone: BadgeTone }> = {
  saved: { label: strings.surveys.outbox.saved, tone: "neutral" },
  pending_sync: { label: strings.surveys.outbox.pendingSync, tone: "warning" },
  audio_pending: { label: strings.surveys.outbox.audioPending, tone: "warning" },
  audio_rejected: { label: strings.surveys.outbox.audioRejected, tone: "danger" },
  blocked: { label: strings.surveys.outbox.blocked, tone: "danger" },
};

export function OutboxStateBadge({ item }: { item: OutboxItem }) {
  const copy = STATE_COPY[displayState(item)];
  return <Badge label={copy.label} tone={copy.tone} />;
}

/**
 * Complete/incomplete, shown apart from the sync badge and kept after the
 * server's receipt. Records saved before this was tracked show nothing:
 * the condition is unknown, never assumed.
 */
function Completeness({ missingRequired }: { missingRequired?: number }) {
  if (missingRequired === undefined) return null;
  const copy = strings.surveys.outbox;
  return missingRequired > 0 ? (
    <Text style={styles.body}>{copy.incomplete(missingRequired)}</Text>
  ) : (
    <Text style={styles.meta}>{copy.complete}</Text>
  );
}

export function OutboxPanel({
  items,
  receipts,
  syncing,
  progress,
  message,
  onSync,
  onDiscard,
  onDiscardAudio,
}: {
  items: OutboxItem[];
  receipts: OutboxReceipt[];
  syncing: boolean;
  progress: SyncProgress | null;
  message: string | null;
  onSync: () => void;
  onDiscard: (id: string) => void;
  onDiscardAudio: (id: string) => void;
}) {
  const copy = strings.surveys.outbox;

  function confirmDiscard(id: string) {
    Alert.alert(copy.discard, copy.discardConfirm, [
      { text: strings.surveys.signOut.cancel, style: "cancel" },
      { text: copy.discard, style: "destructive", onPress: () => onDiscard(id) },
    ]);
  }

  return (
    <Card style={styles.card} testID="survey-outbox">
      <Text style={styles.title}>{copy.title}</Text>
      {items.length === 0 ? <Text style={styles.body}>{copy.empty}</Text> : null}
      {items.map((item) => (
        <View key={item.id} style={styles.row} testID={`outbox-${item.id}`}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>{item.surveyTitle}</Text>
            <OutboxStateBadge item={item} />
          </View>
          <Text style={styles.meta}>{formatDateTime(item.completedAt)}{item.audio ? ` · ${copy.withAudio}` : ""}</Text>
          <Completeness missingRequired={item.missingRequired} />
          <Text style={styles.meta}>{copy.notEditable}</Text>
          {item.blocked ? (
            <>
              <Text style={styles.body}>{copy.blockedReason[item.blocked]}</Text>
              <Text style={styles.body}>{copy.blockedHelp}</Text>
              <Button label={copy.discard} variant="ghost" size="sm" onPress={() => confirmDiscard(item.id)} />
            </>
          ) : null}
          {!item.blocked && item.audio?.rejected ? (
            <>
              <Text style={styles.body}>{copy.audioRejectedHelp}</Text>
              <Button label={copy.discardAudio} variant="ghost" size="sm" onPress={() => onDiscardAudio(item.id)} />
            </>
          ) : null}
        </View>
      ))}
      {progress ? <Text accessibilityLiveRegion="polite" style={styles.body}>{copy.syncing(progress.phase, progress.done, progress.total)}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
      {items.length ? <Button label={copy.syncNow} variant="secondary" loading={syncing} onPress={onSync} /> : null}
      {receipts.slice(0, 5).map((receipt) => (
        <View key={receipt.id} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>{receipt.surveyTitle}</Text>
            <Badge label={copy.received} tone="success" />
          </View>
          <Text style={styles.meta}>{copy.receivedAt(formatDateTime(receipt.receivedAt))}{receipt.withAudio ? ` · ${copy.withAudio}` : ""}</Text>
          <Completeness missingRequired={receipt.missingRequired} />
        </View>
      ))}
      {receipts.some((receipt) => receipt.withAudio) ? <Text style={styles.meta}>{copy.serverProcessing}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.xs, backgroundColor: colors.surfaceRaised },
  noticeText: { ...typography.caption, color: colors.textSecondary },
  card: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  row: { gap: spacing.xs, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  rowTitle: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
});
