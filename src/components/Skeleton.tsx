import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "./ui/theme";

/**
 * especificacion/componentes.md §9 calls for skeleton blocks in "#241B4A
 * sobre superficie1" -- that exact hex isn't in tokens.json, so this uses
 * the closest official token instead (surfaceRaised / noche-800, #1C1730),
 * consistent with never introducing a color that isn't sourced from the
 * token file. See src/design-system/README.md.
 */
export function Skeleton({ width = "100%", height = 14 }: { width?: number | `${number}%`; height?: number }) {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={[styles.bar, { width, height, opacity }]} />;
}

export function SkeletonGroup({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.group} testID="section-skeleton">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? "60%" : "100%"} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
  },
  group: {
    gap: spacing.xs,
  },
});
