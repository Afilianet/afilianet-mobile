import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { FaceMatchStatus } from "../../../types/api";
import { colors, spacing, typography } from "../../ui/theme";

/**
 * Mirrors document-capture/ProcessingState.tsx's exact structure with
 * face-match-specific copy -- mobile UI states only, mapped from
 * FaceMatchStatus, never confused with EvidenceStatus or
 * ComplianceStepStatus (three independent lifecycles).
 */
export function FaceMatchProcessingState({ status }: { status: Extract<FaceMatchStatus, "pending" | "processing"> }) {
  const label = status === "pending" ? "Waiting for selfie" : "Comparing your selfie";
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
