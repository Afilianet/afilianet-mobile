import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "./ui/theme";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
