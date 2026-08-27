import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { SectionCard } from "../../components/SectionCard";
import { SkeletonGroup } from "../../components/Skeleton";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, radius, spacing, typography } from "../../components/ui/theme";
import { affiliateStatusCopy, complianceStatusCopy } from "../../design-system/statusMapping";
import { useAffiliateProfile } from "../../hooks/useAffiliateProfile";
import { useCompliance } from "../../hooks/useCompliance";
import { routes } from "../../navigation/routes";
import { analytics } from "../../services/analytics";
import { useOrganization } from "../../state/OrganizationContext";
import type { AffiliateProfile } from "../../types/api";
import { formatDate } from "../../utils/date";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { organizations, activeOrganization, selectOrganization } = useOrganization();
  const affiliateQuery = useAffiliateProfile();
  const complianceQuery = useCompliance();

  useEffect(() => {
    analytics.capture("profile_viewed");
  }, []);

  return (
    <ScrollView testID="profile-scroll" style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.identityCard}>
        <Avatar name={`${user?.first_name ?? ""} ${user?.last_name ?? ""}`} size={52} />
        <View style={styles.identityText}>
          <Text style={styles.name}>
            {user?.first_name} {user?.last_name}
          </Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </Card>

      <SectionCard
        title="Affiliate"
        query={affiliateQuery}
        isEmpty={() => false}
        emptyTitle="Join the affiliate program"
        emptyDescription="You need an affiliate profile in this organization."
      >
        {(affiliate) => <AffiliateSection affiliate={affiliate} organizationName={activeOrganization?.name} />}
      </SectionCard>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Compliance</Text>
        <ComplianceSummary query={complianceQuery} onPress={() => router.push(routes.compliance as never)} />
      </Card>

      {organizations.length > 1 ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Organizations</Text>
          {organizations.map((org) => {
            const isActive = org.id === activeOrganization?.id;
            return (
              <Pressable
                key={org.id}
                onPress={() => selectOrganization(org.id)}
                style={[styles.orgRow, isActive && styles.orgRowActive]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${org.name}`}
                accessibilityHint={isActive ? "Currently active organization" : undefined}
              >
                <Text style={styles.orgName}>{org.name}</Text>
                {isActive ? <Badge label="Active" tone="success" /> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
    </ScrollView>
  );
}

function AffiliateSection({
  affiliate,
  organizationName,
}: {
  affiliate: AffiliateProfile;
  organizationName: string | undefined;
}) {
  const status = affiliateStatusCopy(affiliate.status);

  return (
    <View style={styles.stateGroup}>
      <View style={styles.row}>
        <Badge label={status.label} tone={status.tone} />
        <Text style={styles.code}>{affiliate.affiliate_code}</Text>
      </View>
      {organizationName ? <Field label="Organization" value={organizationName} /> : null}
      {affiliate.joined_at ? <Field label="Joined" value={formatDate(affiliate.joined_at)} /> : null}
      <Field label="Activated" value={affiliate.activated_at ? formatDate(affiliate.activated_at) : "Not yet activated"} />
      {affiliate.sponsor ? <Field label="Sponsor" value={affiliate.sponsor.affiliate_code} /> : null}
      {affiliate.placement_parent ? (
        <Field label="Placement parent" value={affiliate.placement_parent.affiliate_code} />
      ) : null}
    </View>
  );
}

function ComplianceSummary({ query, onPress }: { query: ReturnType<typeof useCompliance>; onPress: () => void }) {
  const notFound = isApiError(query.error) && query.error.kind === "not_found";
  const otherError = isApiError(query.error) && !notFound;

  let badge = null;
  if (query.isPending) {
    badge = <SkeletonGroup lines={1} />;
  } else if (otherError && isApiError(query.error)) {
    badge = (
      <View style={styles.stateGroup}>
        <Text style={styles.fieldValue}>{friendlyMessage(query.error)}</Text>
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          loading={query.isFetching}
          onPress={() => void query.refetch()}
        />
      </View>
    );
  } else {
    const copy = complianceStatusCopy(notFound ? "not_started" : query.data?.status ?? "not_started");
    badge = <Badge label={copy.label} tone={copy.tone} />;
  }

  return (
    <View style={styles.stateGroup}>
      {badge}
      <Button label="View compliance" variant="secondary" size="sm" onPress={onPress} />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  card: { gap: spacing.sm },
  identityCard: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  identityText: { gap: 2 },
  name: { ...typography.subtitle, color: colors.textPrimary },
  email: { ...typography.body, color: colors.textSecondary },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  stateGroup: { gap: spacing.sm, alignItems: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  code: {
    ...typography.body,
    color: colors.textSecondary,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  orgRowActive: { backgroundColor: colors.surfaceRaised },
  orgName: { ...typography.body, color: colors.textPrimary },
});
