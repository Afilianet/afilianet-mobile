import { Image, StyleSheet, Text, View } from "react-native";
import { violet, night } from "../../design-system/tokens";
import { fontFamilies } from "../../design-system/theme";
import { colors, radius } from "./theme";

type AvatarTone = "brand" | "neutral";

const BACKGROUNDS: Record<AvatarTone, string> = {
  brand: violet[700],
  neutral: night[700],
};

function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

interface AvatarProps {
  name?: string;
  source?: { uri: string } | null;
  size?: number;
  tone?: AvatarTone;
}

export function Avatar({ name = "", source = null, size = 40, tone = "brand" }: AvatarProps) {
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: BACKGROUNDS[tone] },
      ]}
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size, borderRadius: radius.pill }} />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.36), color: colors.textPrimary }]}>
          {initialsFrom(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  initials: {
    fontFamily: fontFamilies.sans.bold,
    letterSpacing: -0.3,
  },
});
