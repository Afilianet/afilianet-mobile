import { Platform } from "react-native";
import {
  borderWidth,
  fontSize,
  fontWeight,
  letterSpacingEm,
  lineHeight,
  measurements,
  motionDuration,
  motionEasing,
  palette,
  pressScale,
  radiusScale,
  semantic,
  spacingScale,
  themes,
} from "./tokens";

/**
 * Resolves tema.oscuro (the official default -- see tokens.json meta.tema_por_defecto)
 * into the flat shape components consume. Dark is hardcoded here; adding a
 * switcher later means resolving `themes.light` instead/conditionally --
 * everything downstream already reads from this one object, not from
 * `tokens.ts` directly, so that's a one-file change.
 */
const active = themes.dark;

export const colors = {
  background: active.background,
  surface: active.surface,
  surfaceRaised: active.surfaceRaised,
  surfaceElevated: active.surfaceElevated,
  border: active.borderSoft,
  borderStrong: active.borderStrong,
  textPrimary: active.textPrimary,
  textSecondary: active.textSecondary,
  textTertiary: active.textTertiary,
  /** Alias of textTertiary -- kept for the handful of call sites (placeholder text, inactive tab icons) already using this name. */
  muted: active.textTertiary,
  textOnBrand: active.textOnBrand,
  /** Alias of textOnBrand -- kept for existing Button call sites. */
  primaryText: active.textOnBrand,
  primary: active.actionPrimary,
  primaryHover: active.actionPrimaryHover,
  primaryActive: active.actionPrimaryActive,
  focusRing: active.focusRing,

  // Flat semantic text colors (semantico.*.texto) for simple `color: colors.success` usage.
  success: semantic.success.text,
  warning: semantic.warning.text,
  danger: semantic.danger.text,
  brand: semantic.brand.text,

  // Full base/soft/overDark/text groups for components that need a
  // background + border + text triad (Badge, status pills).
  semantic,
} as const;

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

// spacing -- both the numeric official scale and the pre-existing semantic
// aliases (which already equal the official values, so no call site changes).
export const spacing = {
  ...spacingScale,
  xs: spacingScale[1],
  sm: spacingScale[2],
  md: spacingScale[4],
  lg: spacingScale[6],
  xl: spacingScale[8],
} as const;

export const radius = {
  sm: radiusScale.sm,
  md: radiusScale.md,
  lg: radiusScale.lg,
  xl: radiusScale.xl,
  xxl: radiusScale["2xl"],
  pill: radiusScale.pill,
  /** Alias of pill -- kept for existing Badge call site. */
  full: radiusScale.pill,
} as const;

export const border = borderWidth;

function role(
  familyToken: "sans" | "mono",
  weightKey: keyof typeof fontWeight,
  sizeKey: keyof typeof fontSize,
  heightKey: keyof typeof lineHeight,
  trackingKey: keyof typeof letterSpacingEm,
  transform?: "uppercase",
) {
  const size = fontSize[sizeKey];
  return {
    fontFamily: familyToken === "mono" ? fontFamilies.mono[weightKey] : fontFamilies.sans[weightKey],
    fontWeight: fontWeight[weightKey],
    fontSize: size,
    lineHeight: Math.round(size * lineHeight[heightKey]),
    letterSpacing: Math.round(letterSpacingEm[trackingKey] * size * 100) / 100,
    ...(transform ? { textTransform: transform } : null),
  };
}

// Loaded family names (see App root layout's useFonts call) -- the actual
// runtime equivalent of tipografia.familia, which is a CSS font-stack string
// that doesn't apply to React Native.
export const fontFamilies = {
  sans: {
    regular: "Manrope_400Regular",
    medium: "Manrope_500Medium",
    semi: "Manrope_600SemiBold",
    bold: "Manrope_700Bold",
    extra: "Manrope_800ExtraBold",
  },
  mono: {
    regular: "JetBrainsMono_400Regular",
    medium: "JetBrainsMono_500Medium",
    // JetBrains Mono 600 isn't in the official loaded-weights list (only
    // 400/500/700) -- semi falls back to 700 so a bold-mono request never
    // silently renders as regular.
    semi: "JetBrainsMono_700Bold",
    bold: "JetBrainsMono_700Bold",
    extra: "JetBrainsMono_700Bold",
  },
} as const;

/**
 * tipografia.roles, resolved to RN TextStyle-compatible objects.
 *
 * Two documented deviations from the handoff, both kept intentionally
 * rather than "corrected" silently -- see the Phase 7A.2 report:
 * 1. `title` uses weight 700 per the JSON (roles.titulo.peso), even though
 *    guia/implementacion.md's prose table says 800 for the same role.
 * 2. `subtitle` uses the JSON's -0.02em tracking (roles.subtitulo.tracking),
 *    even though implementacion.md states negative tracking should only
 *    apply at 21px+ and subtitle is 18px. The JSON is the instructed source
 *    of truth, so it wins; the prose rule is followed everywhere else.
 */
export const typography = {
  display: role("sans", "extra", "4xl", "tight", "display"),
  title: role("sans", "bold", "2xl", "title", "title"),
  subtitle: role("sans", "bold", "lg", "title", "title"),
  body: role("sans", "regular", "sm", "normal", "normal"),
  bodyStrong: role("sans", "semi", "sm", "normal", "normal"),
  label: role("mono", "medium", "3xs", "normal", "label", "uppercase"),
  numeric: role("mono", "regular", "sm", "normal", "normal"),
  /**
   * Not one of the 7 official roles -- a composed convenience for secondary/
   * meta text (list subtitles, notes under a value), following the color
   * system's own guidance that texto3 is "para subtítulos de fila, notas y
   * encabezados de columna" (implementacion.md §2). Uses texto3 + the 2xs
   * step, both official tokens, just not pre-packaged as a named role.
   */
  caption: { ...role("sans", "regular", "2xs", "normal", "normal"), color: colors.textTertiary },
} as const;

export const motion = {
  duration: motionDuration,
  easing: motionEasing,
  pressScale,
} as const;

export const measures = measurements;

/**
 * resplandorMarca (primary button glow), translated to RN's per-platform
 * shadow model -- there's no direct equivalent of CSS's colored box-shadow.
 * iOS gets the real colored glow; Android's classic `elevation` can't tint
 * shadows, so it gets a plain neutral elevation as the closest approximation.
 */
export const shadows = {
  brandGlow: Platform.select({
    ios: {
      shadowColor: palette.violet[500],
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    },
    default: { elevation: 6 },
  }),
} as const;
