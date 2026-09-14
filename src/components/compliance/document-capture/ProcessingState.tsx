import { useRouter } from "expo-router";
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
export function ProcessingState({ status }: { status: Extract<DocumentProcessingStatus, "pending" | "processing"> }) {
  const router = useRouter();
  const stageLabel = status === "pending" ? strings.documentCapture.waitingForDocument : strings.documentCapture.processingDocument;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings.documentCapture.processingTitle}</Text>
      <Text style={styles.reassurance}>{strings.documentCapture.processingHint}</Text>
      <Button label={strings.documentCapture.continueAction} variant="secondary" onPress={() => router.back()} />
      <View style={styles.stageRow} accessible accessibilityLabel={stageLabel}>
        <ActivityIndicator color={colors.textTertiary} size="small" />
        <Text style={styles.stageLabel}>{stageLabel}</Text>
      </View>
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
    marginTop: spacing.xs,
  },
  stageLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
