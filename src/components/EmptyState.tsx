import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Isotipo } from "../design-system/icons/Logo";
import { fontSize, fontWeight } from "../design-system/tokens";
import { colors, spacing } from "./ui/theme";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** "Aún no hay datos" -- distinct from ErrorState/ForbiddenState. Always offers a primary action that creates the first record, where one exists. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Isotipo variant="violeta" size={28} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {action}
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
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    opacity: 0.7,
  },
  copy: {
    gap: spacing[2],
    maxWidth: 320,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extra,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
