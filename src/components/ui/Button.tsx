import { useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { colors, motion, radius, shadows, spacing, typography } from "./theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required full-width in mobile sheets per the official spec. */
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

// especificacion/componentes.md §1 "Tallas" table (34/42/52) -- the
// reference Button.jsx uses 36/44/52 instead; the written spec wins, see
// src/design-system/README.md for the full list of handoff inconsistencies.
const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; radius: number }> = {
  sm: { height: 34, paddingHorizontal: spacing[3], fontSize: typography.body.fontSize - 1, radius: radius.sm },
  md: { height: 42, paddingHorizontal: spacing[4], fontSize: typography.body.fontSize, radius: radius.md },
  lg: { height: 52, paddingHorizontal: spacing[5], fontSize: typography.subtitle.fontSize - 2, radius: radius.md },
};

interface VariantPalette {
  background: string;
  text: string;
  border?: string;
  pressedBackground: string;
}

// especificacion/componentes.md §1 "Variantes" table. "peligro" here is the
// spec's transparent/outlined treatment, not the reference JSX's solid-red
// fill -- see README for why the written spec was preferred.
const VARIANTS: Record<ButtonVariant, VariantPalette> = {
  primary: { background: colors.primary, text: colors.textOnBrand, pressedBackground: colors.primaryActive },
  secondary: {
    background: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    pressedBackground: colors.surfaceRaised,
  },
  ghost: { background: "transparent", text: colors.textSecondary, pressedBackground: colors.surfaceRaised },
  danger: {
    background: "transparent",
    text: colors.danger,
    border: colors.semantic.danger.overDark,
    pressedBackground: colors.semantic.danger.overDark,
  },
};

/** Tops up a below-44px visual button to a 44px minimum touch target without changing its visible size. */
function touchHitSlop(height: number) {
  const deficit = Math.max(0, 44 - height) / 2;
  return { top: deficit, bottom: deficit, left: 0, right: 0 };
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  onPressIn,
  onPressOut,
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = VARIANTS[variant];
  const dimensions = SIZES[size];
  const scale = useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: motion.duration.instant,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={touchHitSlop(dimensions.height)}
      onPressIn={(event) => {
        if (!isDisabled) animateTo(motion.pressScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(1);
        onPressOut?.(event);
      }}
      {...pressableProps}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.base,
            {
              height: dimensions.height,
              minWidth: dimensions.height,
              paddingHorizontal: dimensions.paddingHorizontal,
              borderRadius: dimensions.radius,
              width: fullWidth ? "100%" : undefined,
              backgroundColor: isDisabled ? colors.surfaceRaised : pressed ? palette.pressedBackground : palette.background,
              borderWidth: palette.border ? 1 : 0,
              borderColor: palette.border,
              transform: [{ scale }],
            },
            variant === "primary" && !isDisabled && !pressed ? shadows.brandGlow : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <View style={styles.content}>
              {iconLeft}
              <Text
                style={[
                  styles.label,
                  { fontSize: dimensions.fontSize, color: isDisabled ? colors.textTertiary : palette.text },
                ]}
              >
                {label}
              </Text>
              {iconRight}
            </View>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  label: {
    fontFamily: typography.bodyStrong.fontFamily,
    fontWeight: typography.bodyStrong.fontWeight,
  },
});
