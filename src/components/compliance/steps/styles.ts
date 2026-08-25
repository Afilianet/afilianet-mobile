import { StyleSheet } from "react-native";
import { colors, typography } from "../../ui/theme";

/** Shared by every per-step-type description component -- same visual treatment regardless of step type. */
export const styles = StyleSheet.create({
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
