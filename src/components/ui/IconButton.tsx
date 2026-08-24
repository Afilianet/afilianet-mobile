import { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, type PressableProps } from "react-native";
import { colors, motion, radius } from "./theme";

type IconButtonVariant = "ghost" | "secondary" | "primary";

interface IconButtonProps extends Omit<PressableProps, "style"> {
  /** Required -- the icon alone never communicates purpose on its own. Becomes the accessibility label. */
  label: string;
  size?: number;
  variant?: IconButtonVariant;
  children: React.ReactNode;
}

const BACKGROUNDS: Record<IconButtonVariant, string> = {
  ghost: "transparent",
  secondary: colors.surfaceRaised,
  primary: colors.primary,
};

const PRESSED_BACKGROUNDS: Record<IconButtonVariant, string> = {
  ghost: colors.surfaceRaised,
  secondary: colors.surface,
  primary: colors.primaryHover,
};

/** Single-icon button, 40x40 by default. `label` is mandatory and maps to accessibilityLabel. */
export function IconButton({ label, size = 40, variant = "ghost", disabled, children, ...pressableProps }: IconButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const hitSlopValue = Math.max(0, (44 - size) / 2);

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
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={{ top: hitSlopValue, bottom: hitSlopValue, left: hitSlopValue, right: hitSlopValue }}
      onPressIn={() => !disabled && animateTo(motion.pressScale)}
      onPressOut={() => animateTo(1)}
      {...pressableProps}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.base,
            {
              width: size,
              height: size,
              borderRadius: radius.md,
              borderWidth: variant === "secondary" ? 1 : 0,
              borderColor: colors.border,
              backgroundColor: disabled ? "transparent" : pressed ? PRESSED_BACKGROUNDS[variant] : BACKGROUNDS[variant],
              opacity: disabled ? 0.45 : 1,
              transform: [{ scale }],
            },
          ]}
        >
          {children}
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
});
