import { StyleSheet, Text, View } from "react-native";
import { night } from "../../design-system/tokens";
import { colors, radius, spacing, typography, type BadgeTone } from "./theme";

export type { BadgeTone };

// especificacion/componentes.md §4's tone table. "neutro" deliberately uses
// noche-700/noche-300 directly rather than the surfaceRaised/textSecondary
// aliases -- that's what the written spec calls for, even though it differs
// from the reference JSX's inline neutro colors (superficie-2/texto-2).
const toneColors: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: night[700], text: night[300] },
  brand: { background: colors.semantic.brand.overDark, text: colors.semantic.brand.text },
  success: { background: colors.semantic.success.overDark, text: colors.semantic.success.text },
  warning: { background: colors.semantic.warning.overDark, text: colors.semantic.warning.text },
  danger: { background: colors.semantic.danger.overDark, text: colors.semantic.danger.text },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Versalitas para niveles y metadatos, e.g. "NIVEL 2" -- mono, uppercase, letter-spaced. Status labels should leave this false. */
  mono?: boolean;
}

export function Badge({ label, tone = "neutral", mono = false }: BadgeProps) {
  const palette = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[mono ? styles.labelMono : styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    height: 24,
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3] - 2, // 10px
  },
  label: {
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 11,
    fontWeight: typography.bodyStrong.fontWeight,
  },
  labelMono: {
    ...typography.label,
  },
});
