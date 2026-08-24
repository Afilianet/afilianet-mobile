import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { colors, motion, spacing, typography } from "./theme";

export type ToastTone = "neutral" | "success" | "danger";

const DOT_COLORS: Record<ToastTone, string> = {
  neutral: colors.textTertiary,
  success: colors.success,
  danger: colors.danger,
};

/**
 * A subtle, non-blocking confirmation surface for actions like "link
 * copied" that don't warrant a modal -- absolutely positioned, ignores
 * touches, and fades in with the official "enter" motion curve. Local to
 * whichever screen renders it: there's no app-wide toast queue/provider,
 * since this is the first call site that needs one. The screen owns
 * show/hide timing (via conditional rendering); this component only
 * animates its own entrance. Loosely follows design/handoff's Toast.jsx
 * reference (a tone dot + message on a raised surface) -- no written spec
 * table exists for this component, see src/design-system/README.md.
 */
export function Toast({ message, tone = "neutral" }: { message: string; tone?: ToastTone }) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easing.enter),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.wrapper, { opacity }]} pointerEvents="none" testID="toast">
      <Card elevated padding={12} style={styles.card}>
        <View style={[styles.dot, { backgroundColor: DOT_COLORS[tone] }]} />
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: spacing[5],
    right: spacing[5],
    bottom: spacing[6],
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    alignSelf: "stretch",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
