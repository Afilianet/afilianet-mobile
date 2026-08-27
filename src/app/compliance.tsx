import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import { ComplianceStepCard } from "../components/compliance/ComplianceStepCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { RetryButton } from "../components/RetryButton";
import { SkeletonGroup } from "../components/Skeleton";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { complianceStatusCopy } from "../design-system/statusMapping";
import { useAffiliateProfile } from "../hooks/useAffiliateProfile";
import { useCompliance } from "../hooks/useCompliance";
import { useComplianceSteps } from "../hooks/useComplianceSteps";
import { useStartCompliance } from "../hooks/useStartCompliance";
import { analytics } from "../services/analytics";
import { formatDate } from "../utils/date";

const STEP_TYPE_LABELS: Record<string, string> = {
  identity_information: "Identity information",
  identity_document: "Identity document",
  biometric_liveness: "Liveness check",
  face_match: "Face match",
  verbal_consent: "Verbal consent",
  terms_acceptance: "Terms acceptance",
};

export default function ComplianceScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();
  const complianceQuery = useCompliance();
  const hasCase = complianceQuery.data !== undefined;
  const stepsQuery = useComplianceSteps(hasCase);
  const startMutation = useStartCompliance();
  const [refreshing, setRefreshing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    analytics.capture("compliance_viewed");
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([affiliateQuery.refetch(), complianceQuery.refetch(), stepsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStart() {
    setStartError(null);
    try {
      await startMutation.mutateAsync();
    } catch (error) {
      setStartError(isApiError(error) ? friendlyMessage(error) : "Something went wrong. Please try again.");
    }
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const notStarted = isApiError(complianceQuery.error) && complianceQuery.error.kind === "not_found";
  const otherCaseError = isApiError(complianceQuery.error) && !notStarted;

  return (
    <View style={styles.screen}>
      <ScrollView
        testID="compliance-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Compliance</Text>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {affiliateQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : noAffiliateProfile ? (
          <EmptyState
            title="Join the affiliate program"
            description="You need an affiliate profile in this organization before verification applies to you."
          />
        ) : complianceQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : otherCaseError ? (
          <ErrorState
            error={complianceQuery.error}
            onRetry={() => void complianceQuery.refetch()}
            retrying={complianceQuery.isFetching}
          />
        ) : notStarted ? (
          <NotStartedCard onStart={() => void handleStart()} loading={startMutation.isPending} error={startError} />
        ) : complianceQuery.data ? (
          <>
            <CaseCard compliance={complianceQuery.data} />
            <StepsCard query={stepsQuery} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NotStartedCard({ onStart, loading, error }: { onStart: () => void; loading: boolean; error: string | null }) {
  const status = complianceStatusCopy("not_started");
  return (
    <Card style={styles.card}>
      <View style={styles.statusRow}>
        <Badge label={status.label} tone={status.tone} />
      </View>
      {status.description ? <Text style={styles.description}>{status.description}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Start verification" fullWidth loading={loading} onPress={onStart} />
    </Card>
  );
}

function CaseCard({ compliance }: { compliance: NonNullable<ReturnType<typeof useCompliance>["data"]> }) {
  const status = complianceStatusCopy(compliance.status);
  const nextStepLabel = compliance.current_step ? STEP_TYPE_LABELS[compliance.current_step] ?? compliance.current_step : null;

  return (
    <Card style={styles.card}>
      <View style={styles.statusRow} accessible accessibilityLabel={`Verification status: ${status.label}`}>
        <Badge label={status.label} tone={status.tone} />
      </View>
      {status.description ? <Text style={styles.description}>{status.description}</Text> : null}

      {compliance.status === "rejected" && compliance.rejection_reason ? (
        <Text style={styles.reason}>{compliance.rejection_reason}</Text>
      ) : null}

      {nextStepLabel && !["approved", "rejected", "expired"].includes(compliance.status) ? (
        <Text style={styles.meta}>Next: {nextStepLabel}</Text>
      ) : null}

      {compliance.status === "expired" && compliance.expires_at ? (
        <Text style={styles.meta}>Expired {formatDate(compliance.expires_at)}</Text>
      ) : null}

      {compliance.approved_at ? <Text style={styles.meta}>Approved {formatDate(compliance.approved_at)}</Text> : null}
    </Card>
  );
}

function StepsCard({ query }: { query: ReturnType<typeof useComplianceSteps> }) {
  let body;
  if (query.isPending) {
    body = <SkeletonGroup lines={3} />;
  } else if (query.isError) {
    body = (
      <View style={styles.stateGroup}>
        <Text style={styles.error}>Couldn&apos;t load your required steps.</Text>
        <RetryButton onPress={() => void query.refetch()} loading={query.isFetching} />
      </View>
    );
  } else if (query.data && query.data.length > 0) {
    body = (
      <View>
        {query.data.map((step) => (
          <ComplianceStepCard key={step.id} step={step} />
        ))}
      </View>
    );
  } else if (query.data) {
    body = (
      <EmptyState
        compact
        title="No required steps"
        description="This organization hasn't configured any required verification steps."
      />
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Required steps</Text>
      {body}
    </Card>
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
  card: {
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  reason: {
    ...typography.body,
    color: colors.danger,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
});
