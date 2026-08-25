import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LedgerEntryRow } from "../../components/LedgerEntryRow";
import { PaginatedSectionCard } from "../../components/PaginatedSectionCard";
import { SkeletonGroup } from "../../components/Skeleton";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { useAffiliateProfile } from "../../hooks/useAffiliateProfile";
import { useWallet } from "../../hooks/useWallet";
import { useWalletActivity } from "../../hooks/useWalletActivity";
import { payoutRequest, routes } from "../../navigation/routes";
import { analytics } from "../../services/analytics";
import type { WalletSummary } from "../../types/api";
import { addMoney, formatMoney } from "../../utils/money";

export default function WalletScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();
  const walletQuery = useWallet();

  useEffect(() => {
    analytics.capture("wallet_viewed");
  }, []);

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const profileLoadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile;
  const walletApiError = isApiError(walletQuery.error) ? walletQuery.error : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="wallet-scroll">
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Wallet</Text>
        <Button label="Payouts" variant="ghost" size="sm" onPress={() => router.push(routes.payouts as never)} />
      </View>

      {affiliateQuery.isPending ? (
        <SkeletonGroup lines={4} />
      ) : noAffiliateProfile ? (
        <EmptyState
          title="Join the affiliate program"
          description="You need an affiliate profile in this organization to have a wallet."
        />
      ) : profileLoadFailed ? (
        <ErrorState
          error={affiliateQuery.error}
          onRetry={() => void affiliateQuery.refetch()}
          retrying={affiliateQuery.isFetching}
        />
      ) : affiliateQuery.data ? (
        walletQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : walletApiError ? (
          <ErrorState error={walletApiError} onRetry={() => void walletQuery.refetch()} retrying={walletQuery.isFetching} />
        ) : walletQuery.data && walletQuery.data.length > 0 ? (
          <View style={styles.currencyList}>
            {walletQuery.data.map((wallet) => (
              <WalletCurrencyCard key={wallet.currency} wallet={wallet} />
            ))}
          </View>
        ) : (
          <EmptyState
            title="No wallet balance yet"
            description="Your balances will appear here once you start earning commissions."
          />
        )
      ) : null}
    </ScrollView>
  );
}

function WalletCurrencyCard({ wallet }: { wallet: WalletSummary }) {
  const router = useRouter();
  const activityQuery = useWalletActivity(wallet.currency);
  const total = addMoney(wallet.pending_balance, wallet.available_balance, wallet.currency);
  // A cheap heuristic, not the real eligibility check -- the Payout Request
  // screen calls the actual GET .../payout-eligibility endpoint (which also
  // subtracts outstanding reservations/reserve) before allowing a request.
  // This just avoids showing "Withdraw" for a wallet with nothing in it.
  const canWithdraw = Number(wallet.available_balance) > 0;

  return (
    <View style={styles.currencyBlock}>
      <Card style={styles.balanceCard}>
        <Text style={styles.currencyHeading}>{wallet.currency}</Text>
        <BalanceRow label="Pending" value={formatMoney(wallet.pending_balance, wallet.currency)} />
        <BalanceRow label="Available" value={formatMoney(wallet.available_balance, wallet.currency)} />
        <BalanceRow label="Total" value={formatMoney(total, wallet.currency)} strong />
        {canWithdraw ? (
          <Button
            label="Withdraw"
            variant="secondary"
            size="sm"
            onPress={() => router.push(payoutRequest(wallet.currency) as never)}
          />
        ) : null}
      </Card>

      <PaginatedSectionCard
        title={`${wallet.currency} activity`}
        query={activityQuery}
        emptyTitle="No activity yet"
        renderItem={(entry) => <LedgerEntryRow entry={entry} />}
      />
    </View>
  );
}

function BalanceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const isNegative = value.trim().startsWith("-");
  return (
    <View
      style={styles.balanceRow}
      accessible
      accessibilityLabel={`${label}: ${isNegative ? "negative " : ""}${value}`}
    >
      <Text style={strong ? styles.balanceLabelStrong : styles.balanceLabel}>{label}</Text>
      <Text style={[strong ? styles.balanceValueStrong : styles.balanceValue, isNegative ? styles.negative : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  headerRow: {
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
  currencyBlock: {
    gap: spacing.sm,
  },
  balanceCard: {
    gap: spacing.xs,
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
  negative: {
    color: colors.danger,
  },
});
