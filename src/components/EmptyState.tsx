import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Isotipo } from "../design-system/icons/Logo";
import { fontSize, fontWeight } from "../design-system/tokens";
import { colors, spacing } from "./ui/theme";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Drops full-screen centering/padding for embedding inside a card (e.g. a sub-section), matching ForbiddenState's compact mode. */
  compact?: boolean;
}

/** "Aún no hay datos" -- distinct from ErrorState/ForbiddenState. Always offers a primary action that creates the first record, where one exists. */
export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      <View style={[styles.mark, compact ? styles.markCompact : null]}>
        <Isotipo variant="violeta" size={compact ? 18 : 28} />
      </View>
      <View style={[styles.copy, compact ? styles.copyCompact : null]}>
        <Text style={[styles.title, compact ? styles.textLeft : null]}>{title}</Text>
        {description ? (
          <Text style={[styles.description, compact ? styles.textLeft : null]}>{description}</Text>
        ) : null}
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
  containerCompact: {
    flex: undefined,
    padding: 0,
    alignItems: "flex-start",
    gap: spacing[2],
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
  markCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  copy: {
    gap: spacing[2],
    maxWidth: 320,
  },
  copyCompact: {
    maxWidth: undefined,
  },
  textLeft: {
    textAlign: "left",
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
