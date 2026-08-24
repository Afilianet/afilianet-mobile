import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { fontFamilies } from "../theme";

type LogoVariant = "violeta" | "blanco";

const MARK_FILLS: Record<LogoVariant, string> = {
  violeta: "#6D4AFF",
  blanco: "#FFFFFF",
};

// design/handoff/assets/logo/afilianet-logo-{blanco,violeta}.svg use a
// different fill for the "Afilianet" <text> than for the mark -- the violeta
// variant's wordmark is #0C0A14 (near-black), not the mark's violet.
const WORDMARK_FILLS: Record<LogoVariant, string> = {
  violeta: "#0C0A14",
  blanco: "#FFFFFF",
};

/**
 * The 5-square brand mark (design/handoff/assets/logo/afilianet-isotipo-*.svg).
 * Transcribed rather than loaded as an asset file for the same reason as the
 * icon set -- see src/design-system/icons/paths.ts.
 */
export function Isotipo({ variant = "violeta", size = 40 }: { variant?: LogoVariant; size?: number }) {
  const fill = MARK_FILLS[variant];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible accessibilityLabel="Afilianet">
      <Rect x={6} y={6} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={42} y={6} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={24} y={24} width={16} height={16} rx={4} fill={fill} />
      <Rect x={6} y={42} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
      <Rect x={42} y={42} width={16} height={16} rx={4} fill={fill} fillOpacity={0.4} />
    </Svg>
  );
}

/**
 * Horizontal wordmark -- a direct transcription of the official
 * design/handoff/assets/logo/afilianet-logo-{blanco,violeta}.svg as a single
 * react-native-svg tree: same viewBox (0 0 300 64), same rect coordinates,
 * and the same <text> node (x/y/font-size/font-weight/letter-spacing) as the
 * source, rendered with react-native-svg's own Text element rather than
 * RN's native Text. This keeps the mark and the wordmark as one vector unit
 * that scales together and reproduces the source's exact geometry, instead
 * of approximating it with independently-laid-out native text (which is
 * what an earlier version of this component did, and which also silently
 * dropped the violeta variant's #0C0A14 text color in favor of the mark's
 * violet -- see src/design-system/README.md).
 *
 * fontFamily points at the actually-loaded Manrope 800 weight, since the
 * source SVG's CSS font stack ("Manrope, Helvetica, Arial, sans-serif") has
 * no equivalent in React Native -- the font must be one already loaded via
 * useFonts() in the root layout.
 */
export function Logo({ variant = "blanco", height = 28 }: { variant?: LogoVariant; height?: number }) {
  const width = (height / 64) * 300;
  return (
    <Svg width={width} height={height} viewBox="0 0 300 64" accessible accessibilityLabel="Afilianet">
      <Rect x={6} y={6} width={16} height={16} rx={4} fill={MARK_FILLS[variant]} fillOpacity={0.4} />
      <Rect x={42} y={6} width={16} height={16} rx={4} fill={MARK_FILLS[variant]} fillOpacity={0.4} />
      <Rect x={24} y={24} width={16} height={16} rx={4} fill={MARK_FILLS[variant]} />
      <Rect x={6} y={42} width={16} height={16} rx={4} fill={MARK_FILLS[variant]} fillOpacity={0.4} />
      <Rect x={42} y={42} width={16} height={16} rx={4} fill={MARK_FILLS[variant]} fillOpacity={0.4} />
      <SvgText
        x={82}
        y={43}
        fontFamily={fontFamilies.sans.extra}
        fontSize={34}
        fontWeight="800"
        letterSpacing={-1.2}
        fill={WORDMARK_FILLS[variant]}
      >
        Afilianet
      </SvgText>
    </Svg>
  );
}
