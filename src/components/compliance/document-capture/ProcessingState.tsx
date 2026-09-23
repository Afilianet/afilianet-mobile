import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import type { DocumentProcessingStatus } from "../../../types/api";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";

/**
 * Mobile UI states only, mapped from DocumentProcessingResult.status --
 * never confused with EvidenceStatus or ComplianceStepStatus (three
 * independent lifecycles, see DOCUMENT_ENGINE.md section I).
 *
 * Physical QA finding: uploads have already completed and the
 * document-processing trigger has already returned 202 by the time this
 * ever renders -- Horizon keeps running server-side regardless of whether
 * this screen stays open, and IdentityDocumentStep polls/refetches
 * whenever the affiliate comes back. The OLD version of this screen made
 * the spinner/label the dominant instruction and buried the "you can
 * leave" reassurance in small caption text, so it visually read as "you
 * must wait here." Visual hierarchy now is: (1) processing is underway,
 * (2) the affiliate is free to continue -- shown at the same prominence,
 * with an explicit "Continuar" action, (3) the spinner/stage indicator is
 * secondary detail, not the headline. "Continuar" ONLY navigates back
 * (`router.back()`, the same pattern ComplianceScreen's own close button
 * uses) -- it never touches triggerMutation/polling/query state, so it
 * cannot cancel the server-side job or stop this screen from picking the
 * result back up next time it's open.
 */
export function ProcessingState({
  status,
  onCheckStatus,
  checking = false,
  checkError = false,
}: {
  status: Extract<DocumentProcessingStatus, "pending" | "processing">;
  onCheckStatus?: () => void;
  checking?: boolean;
  checkError?: boolean;
}) {
  const router = useRouter();
  const [takingLong, setTakingLong] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTakingLong(true), 60_000);
    return () => clearTimeout(timer);
  }, []);
  const stageLabel = status === "pending" ? strings.documentCapture.waitingForDocument : strings.documentCapture.processingDocument;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings.documentCapture.processingTitle}</Text>
      <Text style={styles.reassurance}>{strings.documentCapture.processingHint}</Text>
      <Button label={strings.documentCapture.continueAction} variant="primary" fullWidth onPress={() => router.back()} />
      <Text style={styles.received}>{strings.documentCapture.photosReceived}</Text>
      <View style={styles.stageRow} accessible accessibilityLabel={stageLabel}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.stageLabel}>{stageLabel}</Text>
      </View>
      {takingLong || checkError ? (
        <View style={styles.delayed}>
          <Text style={styles.delayedText}>
            {checkError ? strings.documentCapture.statusCheckFailed : strings.documentCapture.processingTakingLong}
          </Text>
          {onCheckStatus ? (
            <Button
              label={strings.documentCapture.checkStatus}
              variant="secondary"
              loading={checking}
              onPress={onCheckStatus}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  reassurance: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  stageLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  received: {
    ...typography.caption,
    color: colors.success,
  },
  delayed: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  delayedText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
