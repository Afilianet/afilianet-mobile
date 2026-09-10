import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import type { LivenessSessionStatus } from "../../../types/api";
import { colors, spacing, typography } from "../../ui/theme";

/**
 * Mirrors face-match/FaceMatchProcessingState.tsx's exact structure with
 * liveness-specific copy -- mobile UI states only, mapped from
 * LivenessSessionStatus, never confused with ComplianceStepStatus (two
 * independent lifecycles). Shown AFTER the native AWS capture component has
 * already closed (capture/streaming itself is over) while afilianet-api
 * polls AWS's own GetFaceLivenessSessionResults and applies the result --
 * this is backend processing time, not "still recording".
 */
export function LivenessProcessingState({ status }: { status: Extract<LivenessSessionStatus, "pending" | "processing"> }) {
  const label = status === "pending" ? strings.liveness.preparingCheck : strings.liveness.reviewingCheck;
  return (
    <View style={styles.container} accessible accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.meta}>{strings.liveness.processingHint}</Text>
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
