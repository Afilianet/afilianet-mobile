import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { strings } from "../../i18n";
import { NotificationBell } from "../../components/NotificationBell";
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
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount";
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
  // Same query key as NotificationBell's own call, so this shares its cache
  // entry rather than firing a second request -- this instance exists only
  // so pull-to-refresh can include the unread badge in its refetch batch.
  const unreadCountQuery = useUnreadNotificationCount();

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
        unreadCountQuery.refetch(),
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
        <SectionCard title={strings.home.affiliateStatusTitle} query={affiliateQuery} isEmpty={() => false}>
          {(affiliate) => <AffiliateStatusContent affiliate={affiliate} />}
        </SectionCard>
      )}

      <ComplianceCard query={complianceQuery} />

      <SectionCard
        title={strings.home.commissionsTitle}
        query={commissionsQuery}
        isEmpty={(list) => list.length === 0}
        emptyTitle={strings.home.noCommissionsYet}
      >
        {(list) => <CommissionsContent commissions={list} />}
      </SectionCard>

      <SectionCard
        title={strings.home.walletTitle}
        query={walletQuery}
        isEmpty={(list) => list.length === 0}
        emptyTitle={strings.home.noWalletBalanceYet}
      >
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

  const orgLabel = activeOrganization?.name ?? strings.home.noOrganizationSelected;

  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <Text style={styles.greeting}>{user ? strings.home.greeting(user.first_name) : strings.home.welcome}</Text>
        <NotificationBell />
      </View>
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
      <Text style={styles.enrollmentTitle}>{strings.joinAffiliateProgram.title}</Text>
      <Text style={styles.meta}>{strings.home.enrollment.description}</Text>
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
      {affiliate.joined_at ? <Text style={styles.meta}>{strings.home.joinedOn(formatDate(affiliate.joined_at))}</Text> : null}
      <Text style={styles.meta}>
        {affiliate.activated_at ? strings.home.activatedOn(formatDate(affiliate.activated_at)) : strings.home.notYetActivated}
      </Text>
      {canShareReferral(affiliate.status) ? (
        <Button
          label={strings.home.shareReferralLink}
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="compartir" size={14} color={colors.textPrimary} />}
          onPress={() => router.push(routes.referral as never)}
        />
      ) : null}
    </View>
  );
}

function ComplianceCard({ query }: { query: ReturnType<typeof useCompliance> }) {
  const router = useRouter();
  const notStarted = complianceStatusCopy("not_started");

  function goToCompliance() {
    analytics.capture("compliance_cta_pressed");
    router.push(routes.compliance as never);
  }

  return (
    <SectionCard
      title={strings.compliance.screenTitle}
      query={query}
      emptyContent={
        <View style={styles.stateGroupLocal}>
          <Badge label={notStarted.label} tone={notStarted.tone} />
          {notStarted.description ? <Text style={styles.meta}>{notStarted.description}</Text> : null}
          <Button label={strings.compliance.startVerification} variant="secondary" onPress={goToCompliance} />
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
              <Button label={strings.home.continueVerification} variant="secondary" onPress={goToCompliance} />
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
      <Button
        label={strings.home.viewAllCommissions}
        variant="ghost"
        size="sm"
        onPress={() => router.push(routes.commissions as never)}
      />
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
          <Text style={styles.meta}>{strings.home.pendingAmount(formatMoney(wallet.pending_balance, wallet.currency))}</Text>
          <Text style={styles.amount}>{strings.home.availableAmount(formatMoney(wallet.available_balance, wallet.currency))}</Text>
        </View>
      ))}
      <Button label={strings.home.viewWallet} variant="ghost" size="sm" onPress={() => router.push(routes.wallet as never)} />
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
  const router = useRouter();
  return (
    <SectionCard
      title={strings.home.networkTitle}
      query={query}
      isEmpty={(page) => page.data.length === 0 && !sponsor}
      emptyTitle={strings.home.noNetworkActivityYet}
    >
      {(page) => {
        const total = page.meta?.total ?? page.data.length;
        const isExact = page.meta?.total !== undefined || page.data.length < 5;
        return (
          <View style={styles.stateGroupLocal}>
            <Text style={styles.meta}>{sponsor ? strings.home.sponsoredBy(sponsor.affiliate_code) : strings.home.noSponsor}</Text>
            <Text style={styles.meta}>{strings.home.directReferrals(total, isExact)}</Text>
            <Button label={strings.home.viewNetwork} variant="ghost" size="sm" onPress={() => router.push(routes.network as never)} />
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
