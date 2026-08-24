import { StyleSheet, Text, View } from "react-native";
import { ledgerEntryStatusCopy } from "../design-system/statusMapping";
import type { LedgerEntry } from "../types/api";
import { formatDate } from "../utils/date";
import { formatMoney } from "../utils/money";
import { Badge } from "./ui/Badge";
import { colors, spacing, typography } from "./ui/theme";

// LedgerEntry.type enum values -- presentation labels only.
const TYPE_LABELS: Record<string, string> = {
  commission: "Commission",
  commission_reversal: "Commission reversal",
  adjustment_credit: "Adjustment (credit)",
  adjustment_debit: "Adjustment (debit)",
  payout: "Payout",
  payout_reversal: "Payout reversal",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

/**
 * `status` is already the backend's effective status (pending vs available,
 * computed from available_at server-side -- see LedgerEntry's type comment).
 * When still pending, this shows the actual maturity date from available_at
 * rather than inventing a hold-period explanation -- never "KYC hold",
 * never implying the underlying sale itself is what's pending.
 */
export function LedgerEntryRow({ entry }: { entry: LedgerEntry }) {
  const status = ledgerEntryStatusCopy(entry.status);
  const isNegative = Number(entry.amount) < 0;
  const amountLabel = formatMoney(entry.amount, entry.currency);
  const label = typeLabel(entry.type);
  const maturity =
    status.label === "Pending" && entry.available_at
      ? `Pending until ${formatDate(entry.available_at)}`
      : formatDate(entry.created_at);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}, ${status.label}, ${isNegative ? "negative " : ""}${amountLabel}, ${maturity}`}
    >
      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={styles.type}>{label}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={styles.meta}>{maturity}</Text>
        {entry.description ? <Text style={styles.meta}>{entry.description}</Text> : null}
      </View>
      <Text style={[styles.amount, isNegative ? styles.amountNegative : null]}>{amountLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 44,
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
