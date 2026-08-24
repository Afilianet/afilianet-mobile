import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { SectionCard } from "../../components/SectionCard";
import { Icon } from "../../design-system/icons/Icon";
import { useAffiliateProfile } from "../../hooks/useAffiliateProfile";
import { useCompliance } from "../../hooks/useCompliance";
import { useCommissions } from "../../hooks/useCommissions";
import { useWallet } from "../../hooks/useWallet";
import { useSponsoredAffiliates } from "../../hooks/useSponsoredAffiliates";
import { routes } from "../../navigation/routes";
import { analytics } from "../../services/analytics";
import { useOrganization } from "../../state/OrganizationContext";
import { affiliateStatusCopy, complianceStatusCopy, commissionStatusCopy } from "../../design-system/statusMapping";
import { formatDate } from "../../utils/date";
import { formatMoney } from "../../utils/money";
import { canShareReferral } from "../../utils/referral";
import type { AffiliateProfile, AffiliateRef, Commission, ComplianceCase, WalletSummary } from "../../types/api";

export default function HomeScreen() {
  const { activeOrganization } = useOrganization();

  const affiliateQuery = useAffiliateProfile();
  const complianceQuery = useCompliance();
  const commissionsQuery = useCommissions();
  const walletQuery = useWallet();
  const sponsoredQuery = useSponsoredAffiliates(affiliateQuery.data?.id);

  const [refreshing, setRefreshing] = useState(false);
  const walletViewedRef = useRef(false);

  useEffect(() => {
    analytics.capture("home_viewed");
  }, []);

  useEffect(() => {
    if (walletQuery.isSuccess && !walletViewedRef.current) {
      walletViewedRef.current = true;
      analytics.capture("wallet_section_viewed");
    }
  }, [walletQuery.isSuccess]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        affiliateQuery.refetch(),
        complianceQuery.refetch(),
        commissionsQuery.refetch(),
        walletQuery.refetch(),
        sponsoredQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";

  return (
    <ScrollView
      testID="home-scroll"
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
    >
      <Header />

      {noAffiliateProfile ? (
        <EnrollmentBanner />
      ) : (
        <SectionCard title="Affiliate status" query={affiliateQuery} isEmpty={() => false}>
          {(affiliate) => <AffiliateStatusContent affiliate={affiliate} />}
        </SectionCard>
      )}

      <ComplianceCard query={complianceQuery} />

      <SectionCard
        title="Commissions"
        query={commissionsQuery}
        isEmpty={(list) => list.length === 0}
        emptyTitle="No commissions yet"
      >
        {(list) => <CommissionsContent commissions={list} />}
      </SectionCard>

      <SectionCard title="Wallet" query={walletQuery} isEmpty={(list) => list.length === 0} emptyTitle="No wallet balance yet">
        {(list) => <WalletContent wallets={list} />}
      </SectionCard>

      {activeOrganization && affiliateQuery.isSuccess ? (
        <NetworkPreviewCard sponsor={affiliateQuery.data.sponsor} query={sponsoredQuery} />
      ) : null}
    </ScrollView>
  );
}

function Header() {
  const { user } = useAuth();
  const { activeOrganization, organizations } = useOrganization();
  const router = useRouter();

  const orgLabel = activeOrganization?.name ?? "No organization selected";

  return (
    <View style={styles.header}>
      <Text style={styles.greeting}>{user ? `Hi, ${user.first_name}` : "Welcome"}</Text>
      {organizations.length > 1 ? (
        <Pressable onPress={() => router.push(routes.organizationPicker as never)} style={styles.orgSwitcher}>
          <Text style={styles.orgName}>{orgLabel}</Text>
          <Text style={styles.orgSwitcherChevron}>⌄</Text>
        </Pressable>
      ) : (
        <Text style={styles.orgName}>{orgLabel}</Text>
      )}
    </View>
  );
}

function EnrollmentBanner() {
  return (
    <Card style={styles.enrollmentCard}>
      <Text style={styles.enrollmentTitle}>Join the affiliate program</Text>
      <Text style={styles.meta}>
        You don&apos;t have an affiliate profile in this organization yet. Contact your organization admin to get enrolled.
      </Text>
    </Card>
  );
}

function AffiliateStatusContent({ affiliate }: { affiliate: AffiliateProfile }) {
  const router = useRouter();
  const status = affiliateStatusCopy(affiliate.status);
  return (
    <View style={styles.stateGroupLocal}>
      <View style={styles.row}>
        <Badge label={status.label} tone={status.tone} />
        <Text style={styles.code}>{affiliate.affiliate_code}</Text>
      </View>
      {affiliate.joined_at ? <Text style={styles.meta}>Joined {formatDate(affiliate.joined_at)}</Text> : null}
      <Text style={styles.meta}>
        {affiliate.activated_at ? `Activated ${formatDate(affiliate.activated_at)}` : "Not yet activated"}
      </Text>
      {canShareReferral(affiliate.status) ? (
        <Button
          label="Share referral link"
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="compartir" size={14} color={colors.textPrimary} />}
          onPress={() => router.push(routes.referral as never)}
        />
      ) : null}
    </View>
  );
}

function handleComplianceCta() {
  analytics.capture("compliance_cta_pressed");
  Alert.alert("Coming soon", "Identity verification will be available in an upcoming update.");
}

function ComplianceCard({ query }: { query: ReturnType<typeof useCompliance> }) {
  const notStarted = complianceStatusCopy("not_started");

  return (
    <SectionCard
      title="Compliance"
      query={query}
      emptyContent={
        <View style={styles.stateGroupLocal}>
          <Badge label={notStarted.label} tone={notStarted.tone} />
          {notStarted.description ? <Text style={styles.meta}>{notStarted.description}</Text> : null}
          <Button label="Start verification" variant="secondary" onPress={handleComplianceCta} />
        </View>
      }
    >
      {(compliance: ComplianceCase) => {
        const status = complianceStatusCopy(compliance.status);
        return (
          <View style={styles.stateGroupLocal}>
            <Badge label={status.label} tone={status.tone} />
            {status.description ? <Text style={styles.meta}>{status.description}</Text> : null}
            {compliance.status !== "approved" ? (
              <Button label="Continue verification" variant="secondary" onPress={handleComplianceCta} />
            ) : null}
          </View>
        );
      }}
    </SectionCard>
  );
}

function CommissionsContent({ commissions }: { commissions: Commission[] }) {
  const router = useRouter();
  const recent = [...commissions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <View style={styles.stateGroupLocal}>
      {recent.map((commission) => {
        const status = commissionStatusCopy(commission.status);
        return (
          <View key={commission.id} style={styles.commissionRow}>
            <View style={styles.commissionMeta}>
              <Text style={styles.meta}>{formatDate(commission.created_at)}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Text style={styles.amount}>{formatMoney(commission.amount, commission.currency)}</Text>
          </View>
        );
      })}
      <Button label="View all commissions" variant="ghost" size="sm" onPress={() => router.push(routes.commissions as never)} />
    </View>
  );
}

function WalletContent({ wallets }: { wallets: WalletSummary[] }) {
  const router = useRouter();
  return (
    <View style={styles.stateGroupLocal}>
      {wallets.map((wallet) => (
        <View key={wallet.currency} style={styles.walletBlock}>
          <Text style={styles.walletCurrency}>{wallet.currency}</Text>
          <Text style={styles.meta}>Pending: {formatMoney(wallet.pending_balance, wallet.currency)}</Text>
          <Text style={styles.amount}>Available: {formatMoney(wallet.available_balance, wallet.currency)}</Text>
        </View>
      ))}
      <Button label="View wallet" variant="ghost" size="sm" onPress={() => router.push(routes.wallet as never)} />
    </View>
  );
}

function NetworkPreviewCard({
  sponsor,
  query,
}: {
  sponsor: AffiliateRef | null | undefined;
  query: ReturnType<typeof useSponsoredAffiliates>;
}) {
  return (
    <SectionCard
      title="Network"
      query={query}
      isEmpty={(page) => page.data.length === 0 && !sponsor}
      emptyTitle="No network activity yet"
    >
      {(page) => {
        const total = page.meta?.total ?? page.data.length;
        const isExact = page.meta?.total !== undefined || page.data.length < 5;
        return (
          <View style={styles.stateGroupLocal}>
            <Text style={styles.meta}>{sponsor ? `Sponsored by ${sponsor.affiliate_code}` : "No sponsor"}</Text>
            <Text style={styles.meta}>
              {total} direct referral{total === 1 ? "" : "s"}
              {isExact ? "" : "+"}
            </Text>
          </View>
        );
      }}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  orgSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  orgName: {
    ...typography.body,
    color: colors.textSecondary,
  },
  orgSwitcherChevron: {
    ...typography.body,
    color: colors.textSecondary,
  },
  enrollmentCard: {
    gap: spacing.xs,
  },
  enrollmentTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  stateGroupLocal: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  code: {
    ...typography.body,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  amount: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  commissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: spacing.sm,
  },
  commissionMeta: {
    gap: spacing.xs,
  },
  walletBlock: {
    gap: 2,
  },
  walletCurrency: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
});
