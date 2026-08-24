import { Pressable, StyleSheet, Text, View } from "react-native";
import { commissionStatusCopy } from "../design-system/statusMapping";
import type { Commission } from "../types/api";
import { formatDate } from "../utils/date";
import { formatMoney } from "../utils/money";
import { Badge } from "./ui/Badge";
import { colors, spacing, typography } from "./ui/theme";

// Commission.type enum values (app/Modules/Commissions/Enums/CommissionType.php) -- presentation labels only, not a status/tone concern.
const TYPE_LABELS: Record<string, string> = {
  direct_sale: "Direct sale",
  sponsor_level: "Sponsor level",
};

export function commissionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function CommissionRow({ commission, onPress }: { commission: Commission; onPress: () => void }) {
  const status = commissionStatusCopy(commission.status);
  const isNegative = Number(commission.amount) < 0;
  const amountLabel = formatMoney(commission.amount, commission.currency);
  const typeLabel = commissionTypeLabel(commission.type);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel} commission, ${status.label}, ${isNegative ? "negative " : ""}${amountLabel}, ${formatDate(commission.created_at)}`}
      accessibilityHint="Opens commission details"
    >
      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={styles.type}>{typeLabel}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={styles.meta}>
          {formatDate(commission.created_at)}
          {commission.network_level !== null && commission.network_level > 0 ? ` · Level ${commission.network_level}` : ""}
        </Text>
      </View>
      <Text style={[styles.amount, isNegative ? styles.amountNegative : null]}>{amountLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: 12,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  type: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  amount: {
    ...typography.numeric,
    fontSize: 14,
    color: colors.textPrimary,
  },
  amountNegative: {
    color: colors.danger,
  },
});
