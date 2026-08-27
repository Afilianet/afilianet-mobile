import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { AffiliateRow } from "../../components/AffiliateRow";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ForbiddenState } from "../../components/ForbiddenState";
import { InvitationRow } from "../../components/InvitationRow";
import { PaginatedSectionCard } from "../../components/PaginatedSectionCard";
import { SectionCard } from "../../components/SectionCard";
import { SkeletonGroup } from "../../components/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { affiliateStatusCopy } from "../../design-system/statusMapping";
import { useAffiliateProfile } from "../../hooks/useAffiliateProfile";
import { useMyInvitations } from "../../hooks/useMyInvitations";
import { useMyPlacementChildren } from "../../hooks/useMyPlacementChildren";
import { useMyPlacementParent } from "../../hooks/useMyPlacementParent";
import { useMySponsor } from "../../hooks/useMySponsor";
import { useMySponsored } from "../../hooks/useMySponsored";
import { networkAffiliateDetail, routes } from "../../navigation/routes";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile } from "../../types/api";

export default function NetworkScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();
  const sponsorQuery = useMySponsor();
  const placementParentQuery = useMyPlacementParent();
  const sponsoredQuery = useMySponsored();
  const placementChildrenQuery = useMyPlacementChildren();
  const invitationsQuery = useMyInvitations();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    analytics.capture("network_viewed");
  }, []);

  function openAffiliate(affiliate: AffiliateProfile) {
    analytics.capture("network_affiliate_opened");
    router.push(networkAffiliateDetail(affiliate.id) as never);
  }

  function pressInvite() {
    analytics.capture("network_invite_pressed");
    router.push(routes.referral as never);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        affiliateQuery.refetch(),
        sponsorQuery.refetch(),
        placementParentQuery.refetch(),
        sponsoredQuery.refetch(),
        placementChildrenQuery.refetch(),
        invitationsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const forbidden = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "forbidden";
  const loadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile && !forbidden;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="network-scroll"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
    >
      <Text style={styles.heading}>Network</Text>

      {affiliateQuery.isPending ? (
        <SkeletonGroup lines={4} />
      ) : noAffiliateProfile ? (
        <EmptyState
          title="Join the affiliate program"
          description="You need an affiliate profile in this organization to see your network."
        />
      ) : forbidden ? (
        <ForbiddenState area="your network" />
      ) : loadFailed ? (
        <ErrorState
          error={affiliateQuery.error}
          onRetry={() => void affiliateQuery.refetch()}
          retrying={affiliateQuery.isFetching}
        />
      ) : affiliateQuery.data ? (
        <>
          <SummaryCard
            affiliate={affiliateQuery.data}
            sponsoredTotal={sponsoredQuery.data?.pages[0]?.meta?.total}
            placementChildrenTotal={placementChildrenQuery.data?.pages[0]?.meta?.total}
            invitationsTotal={invitationsQuery.data?.meta?.total ?? invitationsQuery.data?.data.length}
          />

          <Button
            label="Invite someone"
            iconLeft={<Icon name="compartir" size={16} color={colors.textOnBrand} />}
            onPress={pressInvite}
          />

          <SectionCard
            title="Sponsor"
            helpText="The person who recruited you -- not necessarily where you sit in the network."
            query={sponsorQuery}
            isEmpty={(sponsor) => sponsor === null}
            emptyTitle="You're at the root of this network"
            emptyDescription="You don't have a sponsor -- no one recruited you into this organization."
          >
            {(sponsor) => (sponsor ? <AffiliateRow affiliate={sponsor} /> : null)}
          </SectionCard>

          <SectionCard
            title="Placement parent"
            helpText="Where you're positioned in the network structure -- can differ from your sponsor above."
            query={placementParentQuery}
            isEmpty={(parent) => parent === null}
            emptyTitle="You're at the top of the placement structure"
          >
            {(parent) => (parent ? <AffiliateRow affiliate={parent} /> : null)}
          </SectionCard>

          <PaginatedSectionCard
            title="Direct sponsored"
            helpText="Affiliates you personally recruited."
            query={sponsoredQuery}
            emptyTitle="You haven't sponsored anyone yet"
            onLoadMorePress={() => analytics.capture("network_load_more", { section: "sponsored" })}
            renderItem={(affiliate) => <AffiliateRow affiliate={affiliate} onPress={() => openAffiliate(affiliate)} />}
          />

          <PaginatedSectionCard
            title="Placement children"
            helpText="Affiliates positioned under you in the network structure -- not necessarily people you recruited."
            query={placementChildrenQuery}
            emptyTitle="No one is placed under you yet"
            onLoadMorePress={() => analytics.capture("network_load_more", { section: "placement_children" })}
            renderItem={(affiliate) => <AffiliateRow affiliate={affiliate} onPress={() => openAffiliate(affiliate)} />}
          />

          <SectionCard
            title="My invitations"
            query={invitationsQuery}
            isEmpty={(page) => page.data.length === 0}
            emptyTitle="No invitations sent yet"
            emptyDescription="Invite someone to start growing your network."
          >
            {(page) => (
              <View style={styles.invitationsList}>
                {page.data.map((invitation) => (
                  <InvitationRow key={invitation.id} invitation={invitation} />
                ))}
              </View>
            )}
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );
}

function SummaryCard({
  affiliate,
  sponsoredTotal,
  placementChildrenTotal,
  invitationsTotal,
}: {
  affiliate: AffiliateProfile;
  sponsoredTotal?: number;
  placementChildrenTotal?: number;
  invitationsTotal?: number;
}) {
  const status = affiliateStatusCopy(affiliate.status);
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.code} accessibilityLabel={`Affiliate code ${affiliate.affiliate_code}`}>
          {affiliate.affiliate_code}
        </Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <View style={styles.summaryGrid}>
        <SummaryStat label="Sponsored" value={sponsoredTotal} />
        <SummaryStat label="Placement" value={placementChildrenTotal} />
        <SummaryStat label="Invitations" value={invitationsTotal} />
      </View>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.summaryStat} accessible accessibilityLabel={`${label}: ${value ?? "unavailable"}`}>
      <Text style={styles.summaryValue}>{value ?? "—"}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  heading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  code: {
    ...typography.numeric,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryStat: {
    alignItems: "center",
    gap: 2,
  },
  summaryValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  invitationsList: {
    gap: spacing.sm,
  },
});
