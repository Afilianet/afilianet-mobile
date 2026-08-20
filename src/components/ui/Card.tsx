import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius, spacing } from "./theme";

export function Card({ style, ...viewProps }: ViewProps) {
  return <View style={[styles.card, style]} {...viewProps} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
