import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../api/errors";
import { CommissionDetailSheet } from "../components/CommissionDetailSheet";
import { CommissionRow } from "../components/CommissionRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PaginatedSectionCard } from "../components/PaginatedSectionCard";
import { SkeletonGroup } from "../components/Skeleton";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { useAffiliateProfile } from "../hooks/useAffiliateProfile";
import { useMyCommissions } from "../hooks/useMyCommissions";
import { useWallet } from "../hooks/useWallet";
import { analytics } from "../services/analytics";
import { formatMoney } from "../utils/money";
import type { Commission } from "../types/api";

export default function CommissionsScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();
  const walletQuery = useWallet();
  const commissionsQuery = useMyCommissions();
  const [selected, setSelected] = useState<Commission | null>(null);

  useEffect(() => {
    analytics.capture("commissions_viewed");
  }, []);

  function openDetail(commission: Commission) {
    analytics.capture("commission_detail_opened");
    setSelected(commission);
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const loadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="commissions-scroll">
        <View style={styles.header}>
          <Text style={styles.heading}>Commissions</Text>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {affiliateQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : noAffiliateProfile ? (
          <EmptyState
            title="Join the affiliate program"
            description="You need an affiliate profile in this organization to earn commissions."
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
              <Card style={styles.balanceCard}>
                <Text style={styles.label}>Balance by currency</Text>
                {walletQuery.data.map((wallet) => (
                  <View key={wallet.currency} style={styles.balanceRow}>
                    <Text style={styles.balanceCurrency}>{wallet.currency}</Text>
                    <Text style={styles.balanceAmount}>
                      {formatMoney(wallet.available_balance, wallet.currency)}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <PaginatedSectionCard
              title="Recent commissions"
              query={commissionsQuery}
              emptyTitle="No commissions yet"
              onLoadMorePress={() => analytics.capture("commissions_load_more")}
              renderItem={(commission) => (
                <CommissionRow commission={commission} onPress={() => openDetail(commission)} />
              )}
            />
          </>
        ) : null}
      </ScrollView>

      <CommissionDetailSheet commission={selected} onClose={() => setSelected(null)} />
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
  balanceCard: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceCurrency: {
    ...typography.numeric,
    fontSize: 13,
    color: colors.textSecondary,
  },
  balanceAmount: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
});
