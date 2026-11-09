import { StyleSheet, Text, View } from "react-native";
import { strings } from "../../i18n";
import { Checkbox } from "../ui/Checkbox";
import { colors, spacing, typography } from "../ui/theme";

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
      <Checkbox label={label} checked={checked} disabled={disabled} onChange={onChange} testID="notice-confirmation" />
      <Text style={styles.note}>{strings.privacyNotices.step.notConsent}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  note: { ...typography.caption, color: colors.textTertiary },
});
