import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { DocumentProcessingStatus } from "../../../types/api";
import { colors, spacing, typography } from "../../ui/theme";

/**
 * Mobile UI states only, mapped from DocumentProcessingResult.status --
 * never confused with EvidenceStatus or ComplianceStepStatus (three
 * independent lifecycles, see DOCUMENT_ENGINE.md section I).
 */
export function ProcessingState({ status }: { status: Extract<DocumentProcessingStatus, "pending" | "processing"> }) {
  const label = status === "pending" ? "Waiting for document" : "Processing your document";
  return (
    <View style={styles.container} accessible accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.meta}>This usually takes a few seconds. You don&apos;t need to keep this screen open.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
