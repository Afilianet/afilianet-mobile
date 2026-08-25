import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { payoutStatusCopy } from "../design-system/statusMapping";
import { Icon } from "../design-system/icons/Icon";
import type { Payout } from "../types/api";
import { formatDate } from "../utils/date";
import { formatMoney } from "../utils/money";
import { Badge } from "./ui/Badge";
import { IconButton } from "./ui/IconButton";
import { colors, measures, radius, spacing, typography } from "./ui/theme";

/**
 * A sheet, built purely from the already-fetched list item (GET
 * /payouts/{uuid} exists but returns nothing this list item doesn't
 * already have, and re-fetching by id would be a wasted round trip).
 *
 * Deliberately has no cancel action: afilianet-api's PayoutService has a
 * cancelPayout() method, but no route/controller ever exposes it (verified
 * live -- PATCH /payouts/{uuid} is a 405, no other cancel-shaped route
 * exists). Showing a "Cancel" button here would call an endpoint that
 * doesn't exist. This is a real backend gap, not a client omission -- see
 * the Phase 7B.5 report.
 */
export function PayoutDetailSheet({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  if (!payout) return null;

  const status = payoutStatusCopy(payout.status);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Payout details</Text>
            <IconButton label="Close" onPress={onClose}>
              <Icon name="cerrar" size={18} color={colors.textPrimary} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View
              style={styles.amountBlock}
              accessible
              accessibilityLabel={`${formatMoney(payout.amount, payout.currency)}, ${status.label}`}
            >
              <Text style={styles.amount}>{formatMoney(payout.amount, payout.currency)}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>

            {status.description ? <Text style={styles.explanation}>{status.description}</Text> : null}

            <View style={styles.fields}>
              <Field label="Destination" value={payout.destination?.display_label ?? "—"} />
              <Field label="Reference" value={payout.id} mono />
              {payout.requested_at ? <Field label="Requested" value={formatDate(payout.requested_at)} /> : null}
              {payout.processing_at ? <Field label="Processing since" value={formatDate(payout.processing_at)} /> : null}
              {payout.paid_at ? <Field label="Paid" value={formatDate(payout.paid_at)} /> : null}
              {payout.failed_at ? <Field label="Failed" value={formatDate(payout.failed_at)} /> : null}
              {payout.cancelled_at ? <Field label="Cancelled" value={formatDate(payout.cancelled_at)} /> : null}
              {payout.failure_reason ? <Field label="Reason" value={payout.failure_reason} /> : null}
              <Field label="Created" value={formatDate(payout.created_at)} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono ? styles.fieldValueMono : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(12,10,20,0.6)",
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: measures.mobileGutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  amountBlock: {
    alignItems: "center",
    gap: spacing.sm,
  },
  amount: {
    ...typography.display,
    color: colors.textPrimary,
  },
  explanation: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  fields: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "right",
  },
  fieldValueMono: {
    ...typography.numeric,
    fontSize: 13,
  },
});
