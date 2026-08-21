import { StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "./ui/theme";

export function Skeleton({ width = "100%", height = 14 }: { width?: number | `${number}%`; height?: number }) {
  return <View style={[styles.bar, { width, height }]} />;
}

export function SkeletonGroup({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.group}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? "60%" : "100%"} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
  },
  group: {
    gap: spacing.xs,
  },
});
