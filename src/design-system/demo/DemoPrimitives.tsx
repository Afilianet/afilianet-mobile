/**
 * Demo-only presentational primitives. Visually faithful re-implementations
 * of src/components/ui/{Card,Badge,Button}.tsx and src/components/Skeleton.tsx
 * -- same spacing/radius/typography/motion TOKENS (imported from the real
 * theme.ts, which don't change between light/dark), same component spec
 * (especificacion/componentes.md §§1,3,4,9). The only difference: color
 * comes from an explicit `palette` prop instead of the app-wide `colors`
 * singleton, which is how three variants render side by side in one tree
 * without touching (or reactively depending on) the production theme.
 * `Icon`/`Avatar` ARE the real components -- both already take color/tone as
 * props and need no demo-local copy. See demo/README.md.
 */
import { useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { motion, radius, spacing, typography } from "../../components/ui/theme";
import type { BadgeTone } from "../../components/ui/Badge";
import type { BrandPalette } from "./brandDemoPalettes";

export function DemoCard({
  palette,
  featured = false,
  actionable = false,
  style,
  ...viewProps
}: {
  palette: BrandPalette;
  /** proposalB only (transparent wash elsewhere): tints the ONE hero card per screen. */
  featured?: boolean;
  /** proposalB only: 4px left bar marking the single primary-actionable card. */
  actionable?: boolean;
} & React.ComponentProps<typeof View>) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: featured ? palette.accent.featuredCardWash : palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          borderLeftWidth: actionable ? 4 : 1,
          borderLeftColor: actionable ? palette.accent.actionableBar : palette.border,
        },
        style,
      ]}
      {...viewProps}
    />
  );
}

const toneAccentKey: Record<BadgeTone, keyof BrandPalette["accent"]["iconChip"] | null> = {
  neutral: null,
  brand: "brand",
  success: "success",
  warning: "warning",
  danger: null,
};

export function DemoIconChip({ palette, tone, children }: { palette: BrandPalette; tone: BadgeTone; children: React.ReactNode }) {
  const key = toneAccentKey[tone];
  const background = key ? palette.accent.iconChip[key] : "transparent";
  return (
    <View style={[styles.iconChip, { backgroundColor: background }]}>
      {children}
    </View>
  );
}

export function DemoBadge({ palette, label, tone = "neutral" }: { palette: BrandPalette; label: string; tone?: BadgeTone }) {
  const toneColors: Record<BadgeTone, { background: string; text: string }> = {
    neutral: { background: "rgba(128,128,128,0.22)", text: palette.textSecondary },
    brand: { background: palette.semantic.brand.overDark, text: palette.semantic.brand.text },
    success: { background: palette.semantic.success.overDark, text: palette.semantic.success.text },
    warning: { background: palette.semantic.warning.overDark, text: palette.semantic.warning.text },
    danger: { background: palette.semantic.danger.overDark, text: palette.semantic.danger.text },
  };
  const colorsForTone = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colorsForTone.background }]}>
      <Text style={[styles.badgeLabel, { color: colorsForTone.text }]}>{label}</Text>
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function DemoButton({
  palette,
  label,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  iconLeft,
  onPress,
}: {
  palette: BrandPalette;
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: React.ReactNode;
} & Pick<PressableProps, "onPress">) {
  const [scale] = useState(() => new Animated.Value(1));
  const dims = { sm: { height: 34, ph: spacing[3] }, md: { height: 42, ph: spacing[4] }, lg: { height: 52, ph: spacing[5] } }[size];
  const variants: Record<ButtonVariant, { background: string; text: string; border?: string }> = {
    primary: { background: palette.primary, text: palette.textOnBrand },
    secondary: { background: palette.surface, text: palette.textPrimary, border: palette.border },
    ghost: { background: "transparent", text: palette.textSecondary },
  };
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={() => Animated.timing(scale, { toValue: motion.pressScale, duration: motion.duration.instant, easing: Easing.bezier(...motion.easing.standard), useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(scale, { toValue: 1, duration: motion.duration.instant, easing: Easing.bezier(...motion.easing.standard), useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.buttonBase,
          {
            height: dims.height,
            paddingHorizontal: dims.ph,
            borderRadius: radius.md,
            width: fullWidth ? "100%" : undefined,
            backgroundColor: v.background,
            borderWidth: v.border ? 1 : 0,
            borderColor: v.border,
            transform: [{ scale }],
          },
        ]}
      >
        {iconLeft}
        <Text style={[styles.buttonLabel, { color: v.text }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function DemoSkeleton({ palette, width = "100%", height = 14 }: { palette: BrandPalette; width?: number | `${number}%`; height?: number }) {
  return <View style={[styles.skeletonBar, { width, height, backgroundColor: palette.surfaceRaised }]} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 20, gap: spacing.sm },
  iconChip: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  badge: { alignSelf: "flex-start", height: 24, justifyContent: "center", borderRadius: radius.pill, paddingHorizontal: spacing[3] - 2 },
  badgeLabel: { fontFamily: typography.bodyStrong.fontFamily, fontSize: 11, fontWeight: typography.bodyStrong.fontWeight },
  buttonBase: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2] },
  buttonLabel: { fontFamily: typography.bodyStrong.fontFamily, fontWeight: typography.bodyStrong.fontWeight, fontSize: typography.body.fontSize },
  skeletonBar: { borderRadius: radius.sm },
});
