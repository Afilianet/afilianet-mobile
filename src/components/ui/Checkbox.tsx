import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "./theme";

/**
 * One explicit, never preselected box: the caller owns `checked` and starts
 * it false. The whole row is the touch target and the accessible checkbox.
 */
export function Checkbox({
  label,
  checked,
  disabled,
  onChange,
  testID,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  testID?: string;
  /** Extra content inside the row, under the label (e.g. an "Optional" tag). */
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, checked ? styles.rowChecked : null]}
      testID={testID}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>{checked ? <Text style={styles.mark}>✓</Text> : null}</View>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowChecked: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  box: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  mark: { ...typography.bodyStrong, color: colors.surface },
  body: { flexShrink: 1, gap: spacing.xs },
  label: { ...typography.body, color: colors.textPrimary },
});
