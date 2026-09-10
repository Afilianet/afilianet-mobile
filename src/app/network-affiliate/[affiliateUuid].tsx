import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { AffiliateRow } from "../../components/AffiliateRow";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ForbiddenState } from "../../components/ForbiddenState";
import { PaginatedSectionCard } from "../../components/PaginatedSectionCard";
import { SkeletonGroup } from "../../components/Skeleton";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { affiliateStatusCopy } from "../../design-system/statusMapping";
import { strings } from "../../i18n";
import { useAffiliateDetails } from "../../hooks/useAffiliateDetails";
import { useAffiliatePlacementChildren } from "../../hooks/useAffiliatePlacementChildren";
import { useAffiliateSponsored } from "../../hooks/useAffiliateSponsored";
import { analytics } from "../../services/analytics";
import type { AffiliateRef } from "../../types/api";

export default function AffiliateDetailScreen() {
  const router = useRouter();
  const { affiliateUuid } = useLocalSearchParams<{ affiliateUuid: string }>();

  const detailQuery = useAffiliateDetails(affiliateUuid);
  const sponsoredQuery = useAffiliateSponsored(affiliateUuid, detailQuery.isSuccess);
  const placementChildrenQuery = useAffiliatePlacementChildren(affiliateUuid, detailQuery.isSuccess);

  const forbidden = isApiError(detailQuery.error) && detailQuery.error.kind === "forbidden";
  const notFound = isApiError(detailQuery.error) && detailQuery.error.kind === "not_found";
  const otherError = isApiError(detailQuery.error) && !forbidden && !notFound;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="affiliate-detail-scroll">
        <View style={styles.close}>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {detailQuery.isPending ? (
          <SkeletonGroup lines={5} />
        ) : forbidden ? (
          <ForbiddenState area={strings.networkAffiliate.forbiddenArea} onGoBack={() => router.back()} />
        ) : notFound ? (
          <EmptyState title={strings.networkAffiliate.notFoundTitle} description={strings.networkAffiliate.notFoundDescription} />
        ) : otherError ? (
          <ErrorState
            error={detailQuery.error}
            onRetry={() => void detailQuery.refetch()}
            retrying={detailQuery.isFetching}
          />
        ) : detailQuery.data ? (
          <>
            <IdentityCard affiliate={detailQuery.data} />

            <PaginatedSectionCard
              title={strings.networkAffiliate.directSponsored.title}
              helpText={strings.networkAffiliate.directSponsored.helpText}
              query={sponsoredQuery}
              emptyTitle={strings.networkAffiliate.directSponsored.emptyTitle}
              onLoadMorePress={() => analytics.capture("network_load_more", { section: "sponsored" })}
              renderItem={(affiliate) => <AffiliateRow affiliate={affiliate} />}
            />

            <PaginatedSectionCard
              title={strings.networkAffiliate.placementChildren.title}
              helpText={strings.networkAffiliate.placementChildren.helpText}
              query={placementChildrenQuery}
              emptyTitle={strings.networkAffiliate.placementChildren.emptyTitle}
              onLoadMorePress={() => analytics.capture("network_load_more", { section: "placement_children" })}
              renderItem={(affiliate) => <AffiliateRow affiliate={affiliate} />}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function IdentityCard({
  affiliate,
}: {
  affiliate: { affiliate_code: string; status: string; user?: { first_name: string; last_name: string }; sponsor?: AffiliateRef | null; placement_parent?: AffiliateRef | null; joined_at: string | null };
}) {
  const status = affiliateStatusCopy(affiliate.status);
  const name = affiliate.user ? `${affiliate.user.first_name} ${affiliate.user.last_name}`.trim() : null;

  return (
    <Card style={styles.identityCard}>
      <View style={styles.identityHeader}>
        <Avatar name={name ?? affiliate.affiliate_code} size={48} />
        <View style={styles.identityText}>
          <Text style={styles.name}>{name ?? affiliate.affiliate_code}</Text>
          <Text style={styles.code}>{affiliate.affiliate_code}</Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>

      <View style={styles.relationships}>
        <Text style={styles.relationship}>
          {strings.networkAffiliate.sponsorLabel}
          <Text style={styles.relationshipValue}>{affiliate.sponsor?.affiliate_code ?? strings.networkAffiliate.none}</Text>
        </Text>
        <Text style={styles.relationship}>
          {strings.networkAffiliate.placementParentLabel}
          <Text style={styles.relationshipValue}>
            {affiliate.placement_parent?.affiliate_code ?? strings.networkAffiliate.none}
          </Text>
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  close: {
    alignSelf: "flex-start",
  },
  identityCard: {
    gap: spacing.md,
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  code: {
    ...typography.numeric,
    fontSize: 13,
    color: colors.textSecondary,
  },
  relationships: {
    gap: spacing.xs,
  },
  relationship: {
    ...typography.body,
    color: colors.textSecondary,
  },
  relationshipValue: {
    ...typography.numeric,
    fontSize: 13,
    color: colors.textPrimary,
  },
});
