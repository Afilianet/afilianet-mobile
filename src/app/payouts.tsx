import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../api/errors";
import { AddDestinationSheet } from "../components/AddDestinationSheet";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PaginatedSectionCard } from "../components/PaginatedSectionCard";
import { PayoutDetailSheet } from "../components/PayoutDetailSheet";
import { PayoutRow } from "../components/PayoutRow";
import { SkeletonGroup } from "../components/Skeleton";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { useAffiliateProfile } from "../hooks/useAffiliateProfile";
import { useMyPayouts } from "../hooks/useMyPayouts";
import { usePayoutDestinations } from "../hooks/usePayoutDestinations";
import { usePayoutEligibility } from "../hooks/usePayoutEligibility";
import { useWallet } from "../hooks/useWallet";
import { payoutRequest } from "../navigation/routes";
import { analytics } from "../services/analytics";
import type { Payout, PayoutDestination, WalletSummary } from "../types/api";
import { formatMoney } from "../utils/money";

export default function PayoutsScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();
  const walletQuery = useWallet();
  const destinationsQuery = usePayoutDestinations();
  const payoutsQuery = useMyPayouts();
  const [selected, setSelected] = useState<Payout | null>(null);
  const [addingDestination, setAddingDestination] = useState(false);

  useEffect(() => {
    analytics.capture("payouts_viewed");
  }, []);

  function openDetail(payout: Payout) {
    setSelected(payout);
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const loadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile;
  const destinations = destinationsQuery.data?.data ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="payouts-scroll">
        <View style={styles.header}>
          <Text style={styles.heading}>Payouts</Text>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {affiliateQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : noAffiliateProfile ? (
          <EmptyState
            title="Join the affiliate program"
            description="You need an affiliate profile in this organization to request payouts."
          />
        ) : loadFailed ? (
          <ErrorState
            error={affiliateQuery.error}
            onRetry={() => void affiliateQuery.refetch()}
            retrying={affiliateQuery.isFetching}
          />
        ) : affiliateQuery.data ? (
          <>
            {walletQuery.data && walletQuery.data.length > 0 ? (
              <View style={styles.currencyList}>
                {walletQuery.data.map((wallet) => (
                  <EligibilityCard
                    key={wallet.currency}
                    wallet={wallet}
                    onWithdraw={() => router.push(payoutRequest(wallet.currency) as never)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title="No wallet balance yet"
                description="Once you start earning commissions, you'll be able to request a payout here."
              />
            )}

            <Card style={styles.destinationsCard}>
              <View style={styles.destinationsHeader}>
                <Text style={styles.label}>Payout destinations</Text>
                <Button label="Add" variant="ghost" size="sm" onPress={() => setAddingDestination(true)} />
              </View>
              {destinationsQuery.isPending ? (
                <SkeletonGroup lines={2} />
              ) : destinations.length === 0 ? (
                <Text style={styles.meta}>
                  No payout destination yet. Add one before requesting a withdrawal.
                </Text>
              ) : (
                destinations.map((destination) => <DestinationRow key={destination.id} destination={destination} />)
              )}
            </Card>

            <PaginatedSectionCard
              title="Recent payouts"
              query={payoutsQuery}
              emptyTitle="No payout requests yet"
              onLoadMorePress={() => analytics.capture("payouts_load_more")}
              renderItem={(payout) => <PayoutRow payout={payout} onPress={() => openDetail(payout)} />}
            />
          </>
        ) : null}
      </ScrollView>

      <PayoutDetailSheet payout={selected} onClose={() => setSelected(null)} />
      <AddDestinationSheet
        visible={addingDestination}
        onClose={() => setAddingDestination(false)}
        onCreated={() => setAddingDestination(false)}
      />
    </View>
  );
}

function EligibilityCard({ wallet, onWithdraw }: { wallet: WalletSummary; onWithdraw: () => void }) {
  const eligibilityQuery = usePayoutEligibility(wallet.currency);
  const eligibility = eligibilityQuery.data;
  const canWithdraw = eligibility && Number(eligibility.eligible_balance) > 0;

  return (
    <Card style={styles.eligibilityCard}>
      <Text style={styles.currencyHeading}>{wallet.currency}</Text>

      {eligibilityQuery.isPending ? (
        <SkeletonGroup lines={2} />
      ) : isApiError(eligibilityQuery.error) ? (
        <Text style={styles.meta}>Couldn&apos;t load eligibility for {wallet.currency}.</Text>
      ) : eligibility ? (
        <>
          <BalanceRow label="Available wallet" value={formatMoney(eligibility.available_balance, wallet.currency)} />
          <BalanceRow label="Reserved" value={formatMoney(eligibility.outstanding_reservations, wallet.currency)} />
          <BalanceRow
            label="Eligible to withdraw"
            value={formatMoney(eligibility.eligible_balance, wallet.currency)}
            strong
          />
          <Button label="Withdraw" fullWidth disabled={!canWithdraw} onPress={onWithdraw} />
        </>
      ) : null}
    </Card>
  );
}

function BalanceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.balanceRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={strong ? styles.balanceLabelStrong : styles.balanceLabel}>{label}</Text>
      <Text style={strong ? styles.balanceValueStrong : styles.balanceValue}>{value}</Text>
    </View>
  );
}

function DestinationRow({ destination }: { destination: PayoutDestination }) {
  return (
    <View style={styles.destinationRow} accessible accessibilityLabel={`${destination.display_label}, ${destination.status}`}>
      <Text style={styles.destinationLabel}>{destination.display_label}</Text>
      <Badge label={destination.status === "active" ? "Active" : "Inactive"} tone={destination.status === "active" ? "success" : "neutral"} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  currencyList: {
    gap: spacing.md,
  },
  eligibilityCard: {
    gap: spacing.sm,
  },
  currencyHeading: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  balanceValue: {
    ...typography.numeric,
    fontSize: 14,
    color: colors.textPrimary,
  },
  balanceLabelStrong: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  balanceValueStrong: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  destinationsCard: {
    gap: spacing.sm,
  },
  destinationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  destinationLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
