import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { typography } from "../theme";

type LogoVariant = "violeta" | "blanco";

const FILLS: Record<LogoVariant, string> = {
  violeta: "#6D4AFF",
  blanco: "#FFFFFF",
};

/**
 * The 5-square brand mark (design/handoff/assets/logo/afilianet-isotipo-*.svg).
 * Transcribed rather than loaded as an asset file for the same reason as the
 * icon set -- see src/design-system/icons/paths.ts.
 */
export function Isotipo({ variant = "violeta", size = 40 }: { variant?: LogoVariant; size?: number }) {
  const fill = FILLS[variant];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={6} y={6} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={42} y={6} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={24} y={24} width={16} height={16} rx={4} fill={fill} />
      <Rect x={6} y={42} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={42} y={42} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
    </Svg>
  );
}

/**
 * Horizontal wordmark. The official source combines the isotipo and the
 * word "Afilianet" as one SVG with an embedded <text> element -- here they
 * render as two native pieces (SVG mark + RN <Text> in the loaded Manrope
 * weight) instead, since react-native-svg's text support is less reliable
 * across platforms than the app's own already-loaded font. Documented in
 * src/design-system/README.md.
 */
export function Logo({ variant = "blanco", height = 28 }: { variant?: LogoVariant; height?: number }) {
  return (
    <View style={styles.row}>
      <Isotipo variant={variant} size={height} />
      <Text
        style={[
          styles.wordmark,
          { fontSize: height * 0.6, color: variant === "blanco" ? "#FFFFFF" : FILLS.violeta },
        ]}
      >
        Afilianet
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wordmark: {
    fontFamily: typography.display.fontFamily,
    fontWeight: typography.display.fontWeight,
    letterSpacing: -0.6,
  },
});
