import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { commissionStatusCopy } from "../design-system/statusMapping";
import { Icon } from "../design-system/icons/Icon";
import type { Commission } from "../types/api";
import { formatDate } from "../utils/date";
import { formatMoney } from "../utils/money";
import { commissionTypeLabel } from "./CommissionRow";
import { Badge } from "./ui/Badge";
import { DetailField as Field } from "./ui/DetailField";
import { IconButton } from "./ui/IconButton";
import { colors, measures, radius, spacing, typography } from "./ui/theme";

// Plain-language explanations for the two non-obvious statuses -- per the
// domain rules, not something a raw status word communicates on its own.
const STATUS_EXPLANATION: Record<string, string> = {
  void: "This commission was calculated for audit purposes, but wasn't earned because your account wasn't eligible at the time.",
  reversed: "This commission was later offset by a reversal entry -- for example, after a refund.",
};

/**
 * A sheet, not a route: afilianet-api's CommissionPolicy::view is
 * manager/owner/admin-only with no beneficiary exception (an affiliate sees
 * their own commissions only through GET /commissions/mine, never
 * GET /commissions/{id} -- see fetchAffiliateDetails-equivalent comment in
 * api/endpoints.ts's fetchMyCommissionsPage). There is no single-commission
 * endpoint this app can call for its own data, so "detail" is built purely
 * from the already-fetched list item, passed in directly rather than
 * re-fetched by id. `sale`/`reversal_of` are consequently almost always
 * absent here (the list endpoint doesn't eager-load those relations) --
 * shown only when actually present, never fabricated.
 */
export function CommissionDetailSheet({ commission, onClose }: { commission: Commission | null; onClose: () => void }) {
  if (!commission) return null;

  const status = commissionStatusCopy(commission.status);
  const explanation = STATUS_EXPLANATION[commission.status];
  const isNegative = Number(commission.amount) < 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Commission details</Text>
            <IconButton label="Close" onPress={onClose}>
              <Icon name="cerrar" size={18} color={colors.textPrimary} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View
              style={styles.amountBlock}
              accessible
              accessibilityLabel={`${isNegative ? "Negative amount " : ""}${formatMoney(commission.amount, commission.currency)}, ${status.label}`}
            >
              <Text style={[styles.amount, isNegative ? styles.amountNegative : null]}>
                {formatMoney(commission.amount, commission.currency)}
              </Text>
              <Badge label={status.label} tone={status.tone} />
            </View>

            {explanation ? <Text style={styles.explanation}>{explanation}</Text> : null}

            <View style={styles.fields}>
              <Field label="Type" value={commissionTypeLabel(commission.type)} />
              {commission.network_level !== null ? (
                <Field label="Level" value={String(commission.network_level)} />
              ) : null}
              <Field label="Reference" value={commission.id} mono />
              {commission.sale?.id ? <Field label="Sale" value={commission.sale.id} mono /> : null}
              {commission.reversal_of ? <Field label="Reverses" value={commission.reversal_of} mono /> : null}
              <Field
                label="Calculated"
                value={commission.calculated_at ? formatDate(commission.calculated_at) : "—"}
              />
              {commission.reversed_at ? <Field label="Reversed" value={formatDate(commission.reversed_at)} /> : null}
              <Field label="Created" value={formatDate(commission.created_at)} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
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
  amountNegative: {
    color: colors.danger,
  },
  explanation: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  fields: {
    gap: spacing.sm,
  },
});
