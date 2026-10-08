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
  /** Only applied when the active palette actually defines a featuredCardWash (proposalB) -- current/A silently fall back to the normal `surface` fill, never a see-through card. */
  featured?: boolean;
  /** Only applied when the active palette actually defines an actionableBar (proposalB) -- current/A keep their normal, uniform 1px border. */
  actionable?: boolean;
} & React.ComponentProps<typeof View>) {
  const useFeatured = featured && palette.accent.featuredCardWash != null;
  const useActionable = actionable && palette.accent.actionableBar != null;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: useFeatured ? palette.accent.featuredCardWash! : palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          borderLeftWidth: useActionable ? 4 : 1,
          borderLeftColor: useActionable ? palette.accent.actionableBar! : palette.border,
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
  danger: "danger",
};

/**
 * `tone` must reflect the ACTUAL data currently on screen (e.g. the same
 * tone a Badge below it already computed from statusMapping.ts) -- never a
 * fixed tone chosen because of what the section is *called*. See
 * brandDemoPalettes.ts's `accent.iconChip` docblock and
 * guia/implementacion.md §2 ("aqua solo para dinero liberado... alerta solo
 * si existe espera real"). Falls back to a plain, untinted chip whenever the
 * active palette has no accent for that tone (current/A always; B falls
 * back too for `tone="neutral"`, which has no official wash to begin with).
 */
export function DemoIconChip({ palette, tone, children }: { palette: BrandPalette; tone: BadgeTone; children: React.ReactNode }) {
  const key = toneAccentKey[tone];
  const background = key ? palette.accent.iconChip[key] : null;
  return <View style={[styles.iconChip, { backgroundColor: background ?? "transparent" }]}>{children}</View>;
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

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Mirrors Button.tsx's own touchHitSlop() exactly -- a sub-44px visual size (per especificacion/componentes.md §1's sm/md table) still gets a full 44px tappable area. */
function touchHitSlop(height: number) {
  const deficit = Math.max(0, 44 - height) / 2;
  return { top: deficit, bottom: deficit, left: 0, right: 0 };
}

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
    // especificacion/componentes.md §1: "peligro... destructivo, siempre con
    // confirmación" -- transparent fill, error-toned text/border, never a
    // plain ghost/secondary button for a destructive action.
    danger: { background: "transparent", text: palette.semantic.danger.text, border: palette.semantic.danger.overDark },
  };
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={touchHitSlop(dims.height)}
      onPressIn={() => Animated.timing(scale, { toValue: motion.pressScale, duration: motion.duration.instant, easing: Easing.bezier(...motion.easing.standard), useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(scale, { toValue: 1, duration: motion.duration.instant, easing: Easing.bezier(...motion.easing.standard), useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.buttonBase,
          {
            // minHeight, not height: lets the row grow instead of clipping
            // the label when the OS text-size setting (Dynamic Type /
            // "Larger Text") makes it wrap to two lines.
            minHeight: dims.height,
            paddingHorizontal: dims.ph,
            paddingVertical: spacing.xs,
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
  badge: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center", borderRadius: radius.pill, paddingHorizontal: spacing[3] - 2, paddingVertical: 2 },
  badgeLabel: { fontFamily: typography.bodyStrong.fontFamily, fontSize: 11, fontWeight: typography.bodyStrong.fontWeight },
  buttonBase: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2] },
  buttonLabel: { fontFamily: typography.bodyStrong.fontFamily, fontWeight: typography.bodyStrong.fontWeight, fontSize: typography.body.fontSize, flexShrink: 1 },
  skeletonBar: { borderRadius: radius.sm },
});
