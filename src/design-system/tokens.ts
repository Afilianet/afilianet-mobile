/**
 * Direct TypeScript mirror of design/handoff/tokens/afilianet.tokens.json --
 * the official source of truth for the Afilianet visual system. Every export
 * here is named after (and commented with) its exact JSON path so a future
 * token change can be cross-checked line by line. Nothing in this file is
 * invented; if a value isn't here, it isn't an official token yet.
 *
 * See src/design-system/README.md before adding to or changing this file.
 */

// color.violeta
export const violet = {
  50: "#F4F0FF",
  100: "#E7DEFF",
  200: "#C9B8FF",
  300: "#A78BFA",
  400: "#8F73FF",
  500: "#6D4AFF",
  600: "#5533E6",
  700: "#3D26B8",
  900: "#22156B",
} as const;

// color.noche
export const night = {
  0: "#FFFFFF",
  50: "#F3F2F8",
  100: "#E4E1EE",
  200: "#C9C5DC",
  300: "#A9A2C4",
  400: "#857CA8",
  500: "#575072",
  600: "#3B3355",
  700: "#2A2340",
  800: "#1C1730",
  900: "#14101F",
  950: "#0C0A14",
} as const;

// color.aqua
export const aqua = {
  100: "#D3F6F1",
  500: "#2DD4BF",
  600: "#14A99A",
} as const;

export const palette = { violet, night, aqua } as const;

// semantico.* -- each tone's four shades (base, soft/suave, overDark/sobreOscuro, text/texto)
export const semantic = {
  success: {
    base: "#2DD4BF",
    soft: "#D3F6F1",
    overDark: "rgba(45,212,191,0.14)",
    text: "#2DD4BF",
  },
  warning: {
    base: "#F2B94B",
    soft: "#FCF0D8",
    overDark: "rgba(242,185,75,0.14)",
    text: "#F2B94B",
  },
  danger: {
    base: "#FF6A5E",
    soft: "#FFE3E0",
    overDark: "rgba(255,106,94,0.14)",
    text: "#FF6A5E",
  },
  brand: {
    base: "#6D4AFF",
    soft: "#E7DEFF",
    overDark: "rgba(109,74,255,0.18)",
    text: "#C9B8FF",
  },
} as const;

// tema.oscuro / tema.claro -- alias tables. Only "oscuro" is wired up as the
// active theme (src/design-system/theme.ts) per the official default; claro
// is kept here so it isn't lost, ready for a future theme switcher.
export const themes = {
  dark: {
    background: night[950],
    surface: night[900],
    surfaceRaised: night[800],
    surfaceElevated: night[800],
    borderSoft: night[700],
    borderStrong: night[600],
    textPrimary: "#ECEAF4",
    textSecondary: night[300],
    textTertiary: night[400],
    textOnBrand: "#FFFFFF",
    actionPrimary: violet[500],
    actionPrimaryHover: violet[400],
    actionPrimaryActive: violet[600],
    focusRing: violet[300],
  },
  light: {
    background: night[0],
    surface: night[50],
    surfaceRaised: violet[50],
    surfaceElevated: night[0],
    borderSoft: night[100],
    borderStrong: night[200],
    textPrimary: night[950],
    textSecondary: night[500],
    textTertiary: night[500],
    textOnBrand: "#FFFFFF",
    actionPrimary: violet[500],
    actionPrimaryHover: violet[600],
    actionPrimaryActive: violet[700],
    focusRing: violet[300],
  },
} as const;

// tipografia.familia -- React Native has no CSS font-stack fallback; the
// actual loaded family names (from @expo-google-fonts/*) are wired in
// theme.ts. Kept here for traceability to the source token.
export const fontFamilyReference = {
  sans: '"Manrope", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
} as const;

// tipografia.peso
export const fontWeight = {
  regular: "400",
  medium: "500",
  semi: "600",
  bold: "700",
  extra: "800",
} as const;

// tipografia.escala
export const fontSize = {
  "3xs": 11,
  "2xs": 12,
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 21,
  "2xl": 26,
  "3xl": 32,
  "4xl": 40,
  "5xl": 52,
  "6xl": 68,
  "7xl": 88,
} as const;

// tipografia.alto -- line-height multipliers
export const lineHeight = {
  tight: 1.05,
  title: 1.15,
  normal: 1.5,
  loose: 1.65,
} as const;

// tipografia.tracking -- React Native's letterSpacing is in points, not em;
// theme.ts converts these against each role's font size where they apply.
export const letterSpacingEm = {
  display: -0.035,
  title: -0.02,
  normal: 0,
  label: 0.14,
} as const;

// espaciado -- base-4 scale. Numeric keys match the JSON's own step numbers.
export const spacingScale = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

// radio
export const radiusScale = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  pill: 999,
  // iconoApp is a percentage ("22%"), meaningful only for square app-icon
  // masks generated at build time -- not a runtime RN radius value.
} as const;

// borde
export const borderWidth = {
  thin: 1,
  thick: 2,
} as const;

// sombra -- React Native has no multi-layer box-shadow; theme.ts translates
// the ones that matter (resplandorMarca, anilloFoco) into RN shadow props.
export const shadowReference = {
  resplandorMarca: "0 8px 28px rgba(109,74,255,0.35)",
  anilloFoco: "0 0 0 3px rgba(167,139,250,0.45)",
} as const;

// movimiento.duracion (ms) and .curva (as cubic-bezier arrays for Reanimated/Easing)
export const motionDuration = {
  instant: 90,
  fast: 160,
  medium: 240,
  slow: 400,
} as const;

export const motionEasing = {
  exit: [0.32, 0.72, 0, 1],
  enter: [0.4, 0, 1, 1],
  standard: [0.2, 0, 0.2, 1],
  spring: [0.34, 1.4, 0.64, 1],
} as const;

export const pressScale = 0.975; // movimiento.escalaPresion

// medidas
export const measurements = {
  minTouchTarget: 44, // toqueMinimo
  mobileGutter: 20, // gutterMovil
  readingWidthCh: 68, // anchoLectura (web-only concept, kept for reference)
} as const;
