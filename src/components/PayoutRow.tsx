import { Pressable, StyleSheet, Text, View } from "react-native";
import { payoutStatusCopy } from "../design-system/statusMapping";
import { fontSize } from "../design-system/tokens";
import type { Payout } from "../types/api";
import { formatDate } from "../utils/date";
import { formatMoney } from "../utils/money";
import { Badge } from "./ui/Badge";
import { colors, spacing, typography } from "./ui/theme";

export function PayoutRow({ payout, onPress }: { payout: Payout; onPress: () => void }) {
  const status = payoutStatusCopy(payout.status);
  const amountLabel = formatMoney(payout.amount, payout.currency);
  const destinationLabel = payout.destination?.display_label ?? "—";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${amountLabel} ${payout.currency} payout, ${status.label}, to ${destinationLabel}, requested ${payout.requested_at ? formatDate(payout.requested_at) : "unknown date"}`}
      accessibilityHint="Opens payout details"
    >
      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={styles.amount}>{amountLabel}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={styles.meta}>{destinationLabel}</Text>
        <Text style={styles.meta}>
          {payout.requested_at ? `Requested ${formatDate(payout.requested_at)}` : "—"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
    gap: 2,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  info: {
    gap: 2,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  amount: {
    ...typography.numeric,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
