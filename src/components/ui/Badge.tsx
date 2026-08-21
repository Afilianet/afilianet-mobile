import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "./theme";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

const toneColors: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: "#EEF0F3", text: colors.textSecondary },
  success: { background: "#E4F6EC", text: colors.success },
  warning: { background: "#FBF0DC", text: colors.warning },
  danger: { background: "#FBE7E5", text: colors.danger },
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const palette = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
  },
});
