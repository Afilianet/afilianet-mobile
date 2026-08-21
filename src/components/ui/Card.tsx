import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius } from "./theme";

interface CardProps extends ViewProps {
  padding?: number;
  bordered?: boolean;
  /** Floating surfaces (sheets, popovers) -- adds shadow + inner highlight ring instead of relying on border alone. */
  elevated?: boolean;
}

export function Card({ padding = 20, bordered = true, elevated = false, style, ...viewProps }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { padding, backgroundColor: elevated ? colors.surfaceElevated : colors.surface },
        bordered && !elevated ? styles.bordered : null,
        elevated ? styles.elevated : null,
        style,
      ]}
      {...viewProps}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    shadowColor: "#0C0A14",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
});
