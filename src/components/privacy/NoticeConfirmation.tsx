import { Pressable, StyleSheet, Text, View } from "react-native";
import { strings } from "../../i18n";
import { colors, radius, spacing, typography } from "../ui/theme";

/**
 * The one explicit confirmation a notice step asks for (API #91): the listed
 * versions were made available before continuing. Never preselected; it is
 * not a consent nor an acceptance of terms, and it does not claim the
 * documents were opened or read.
 */
export function NoticeConfirmation({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        style={[styles.row, checked ? styles.rowChecked : null]}
        testID="notice-confirmation"
      >
        <View style={[styles.box, checked ? styles.boxChecked : null]}>{checked ? <Text style={styles.mark}>✓</Text> : null}</View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      <Text style={styles.note}>{strings.privacyNotices.step.notConsent}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
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
  label: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  note: { ...typography.caption, color: colors.textTertiary },
});
