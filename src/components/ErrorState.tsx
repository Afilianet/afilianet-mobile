import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import { RetryButton } from "./RetryButton";
import { colors, spacing, typography } from "./ui/theme";

export function ErrorState({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const message = isApiError(error) ? friendlyMessage(error) : "Something went wrong.";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>We hit a snag</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <RetryButton onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
