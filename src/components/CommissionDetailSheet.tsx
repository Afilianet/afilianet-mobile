import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { commissionStatusCopy } from "../design-system/statusMapping";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
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
const STATUS_EXPLANATION: Record<string, string> = strings.commissions.statusExplanation;

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
            <Text style={styles.title}>{strings.commissions.detailsTitle}</Text>
            <IconButton label={strings.common.close} onPress={onClose}>
              <Icon name="cerrar" size={18} color={colors.textPrimary} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View
              style={styles.amountBlock}
              accessible
              accessibilityLabel={`${isNegative ? strings.commissions.negativeAmountA11y : ""}${formatMoney(commission.amount, commission.currency)}, ${status.label}`}
            >
              <Text style={[styles.amount, isNegative ? styles.amountNegative : null]}>
                {formatMoney(commission.amount, commission.currency)}
              </Text>
              <Badge label={status.label} tone={status.tone} />
            </View>

            {explanation ? <Text style={styles.explanation}>{explanation}</Text> : null}

            <View style={styles.fields}>
              <Field label={strings.commissions.fields.type} value={commissionTypeLabel(commission.type)} />
              {commission.network_level !== null ? (
                <Field label={strings.commissions.fields.level} value={String(commission.network_level)} />
              ) : null}
              <Field label={strings.commissions.fields.reference} value={commission.id} mono />
              {commission.sale?.id ? <Field label={strings.commissions.fields.sale} value={commission.sale.id} mono /> : null}
              {commission.reversal_of ? (
                <Field label={strings.commissions.fields.reverses} value={commission.reversal_of} mono />
              ) : null}
              <Field
                label={strings.commissions.fields.calculated}
                value={commission.calculated_at ? formatDate(commission.calculated_at) : strings.commissions.notAvailable}
              />
              {commission.reversed_at ? (
                <Field label={strings.commissions.fields.reversed} value={formatDate(commission.reversed_at)} />
              ) : null}
              <Field label={strings.commissions.fields.created} value={formatDate(commission.created_at)} />
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
