import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { strings } from "../i18n";
import { colors, spacing, typography } from "./ui/theme";

export function LoadingState({ message = strings.shared.loading }: { message?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
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
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
