export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: "700" as const },
  heading: { fontSize: 20, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
};

// Neutral enough to refine into real brand colors later.
export const colors = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  border: "#E2E5EA",
  textPrimary: "#101418",
  textSecondary: "#5B6472",
  primary: "#208AEF",
  primaryText: "#FFFFFF",
  success: "#1E9E63",
  warning: "#B7791F",
  danger: "#D0392B",
  muted: "#9AA3AF",
};
