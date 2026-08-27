import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "./theme";

/** A label/value row used by detail sheets (Commission, Payout) -- shared so both stay in sync instead of drifting independently. */
export function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono ? styles.fieldValueMono : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "right",
  },
  fieldValueMono: {
    ...typography.numeric,
    fontSize: 13,
  },
});
