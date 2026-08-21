import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./ui/Button";
import { colors, radius, spacing, typography } from "./ui/theme";

/**
 * 403 -- "not a failure," per the spec: the lock is always neutral, never
 * red. No official lock icon exists in the 24-icon set, so this is the
 * documented Ionicons-fallback exception (the other being the Profile tab
 * icon) -- see src/design-system/README.md.
 */
export function ForbiddenState({
  area,
  role,
  compact = false,
  onRequestAccess,
  onGoBack,
}: {
  area: string;
  role?: string;
  /** Drops full-screen centering/padding for embedding inside a card (e.g. SectionCard). */
  compact?: boolean;
  onRequestAccess?: () => void;
  onGoBack?: () => void;
}) {
  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      <View style={[styles.mark, compact ? styles.markCompact : null]}>
        <Ionicons name="lock-closed-outline" size={compact ? 20 : 26} color={colors.textSecondary} />
      </View>
      <View style={[styles.copy, compact ? styles.copyCompact : null]}>
        <Text style={[styles.eyebrow, compact ? styles.textLeft : null]}>Error 403</Text>
        <Text style={[styles.title, compact ? styles.textLeft : null]}>
          {role ? `${role} can't access ${area}` : `You can't access ${area}`}
        </Text>
        {compact ? null : (
          <Text style={styles.message}>
            Ask an organization admin for access. This request is recorded in the audit log.
          </Text>
        )}
      </View>
      {onRequestAccess || onGoBack ? (
        <View style={styles.actions}>
          {onRequestAccess ? <Button label="Request access" variant="secondary" onPress={onRequestAccess} /> : null}
          {onGoBack ? <Button label="Go back" variant="ghost" onPress={onGoBack} /> : null}
        </View>
      ) : null}
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
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  markCompact: {
    width: 36,
    height: 36,
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
  eyebrow: {
    ...typography.label,
    color: colors.textTertiary,
    textAlign: "center",
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
  actions: {
    flexDirection: "row",
    gap: spacing[3],
  },
});
