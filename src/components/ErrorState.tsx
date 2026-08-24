import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import { Icon } from "../design-system/icons/Icon";
import { RetryButton } from "./RetryButton";
import { colors, radius, spacing, typography } from "./ui/theme";

/**
 * No official icon exists for a generic "error" state (the 24-icon set has
 * no error/x-circle mark) -- "alerta" (warning triangle) is the closest
 * official icon and is reused here, tinted in the error color, matching the
 * spec's "marca en error sobre error.sobreOscuro."
 */
export function ErrorState({ error, onRetry, retrying }: { error: unknown; onRetry?: () => void; retrying?: boolean }) {
  const message = isApiError(error) ? friendlyMessage(error) : "Something went wrong.";
  const status = isApiError(error) && error.status ? error.status : "UNKNOWN";
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Icon name="alerta" size={28} color={colors.danger} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>This didn&apos;t load</Text>
        <Text style={styles.message}>{message} Your data is safe -- nothing was lost.</Text>
        <Text style={styles.technical}>ERR-{status} · {time}</Text>
      </View>
      {onRetry ? <RetryButton onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    padding: spacing[6],
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.semantic.danger.overDark,
  },
  copy: {
    gap: spacing[2],
    maxWidth: 320,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  technical: {
    ...typography.numeric,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
