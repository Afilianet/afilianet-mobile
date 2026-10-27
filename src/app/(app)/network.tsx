import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { fetchPendingAssistedEnrollments } from "../../api/assistedEnrollment";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAuth } from "../../auth/AuthContext";
import { useOrganization } from "../../state/OrganizationContext";
import { hasPersonalAffiliateAccess, isOrganizationStaff } from "../../state/membership";
import { canRetryBlocked, listPendingAssisted, removePendingAssisted, retryBlockedAssisted, syncPendingAssisted, type PendingAssistedEnrollment } from "../../services/assistedQueue";
import { blockedExplanation, checkServerBeforeDiscard, discardConfirmation } from "../../utils/assistedPending";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../../api/errors";
import { AffiliateRow } from "../../components/AffiliateRow";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ForbiddenState } from "../../components/ForbiddenState";
import { InvitationRow } from "../../components/InvitationRow";
import { NetworkSearchSection } from "../../components/network/NetworkSearchSection";
import { OrganizationAffiliatesSection } from "../../components/network/OrganizationAffiliatesSection";
import { SectionCard } from "../../components/SectionCard";
import { SkeletonGroup } from "../../components/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { affiliateStatusCopy } from "../../design-system/statusMapping";
import { ActiveOrganizationBar } from "../../components/ActiveOrganizationBar";
import { strings } from "../../i18n";
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
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  // API #75: personal network and assisted enrollment need an affiliate
  // profile in THIS organization; staff without one get the management view.
  const personal = hasPersonalAffiliateAccess(activeOrganization);
  const staff = isOrganizationStaff(activeOrganization);
  const [assistedPage, setAssistedPage] = useState(1);
  const assistedQuery = useApiQuery(
    ["assisted-enrollments", user?.id, activeOrganization?.id, assistedPage],
    () => fetchPendingAssistedEnrollments(assistedPage),
    { enabled: Boolean(user) && personal },
  );
  const [pendingItems, setPendingItems] = useState<PendingAssistedEnrollment[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!user || !activeOrganization || !hasPersonalAffiliateAccess(activeOrganization)) return;
    let active = true;
    void listPendingAssisted(user.id, activeOrganization.id)
      .then((items) => { if (active) { setPendingItems(items); } })
      .catch(() => { if (active) setSyncMessage("No se pudieron leer los registros pendientes."); });
    return () => { active = false; };
  }, [user, activeOrganization]));

  async function syncPending() {
    if (!user || !activeOrganization) return;
    setSyncing(true);
    try {
      const { completed, remaining, blocked, error: syncError } = await syncPendingAssisted(user.id, activeOrganization.id);
      setPendingItems(await listPendingAssisted(user.id, activeOrganization.id));
      const blockedNote = blocked ? ` ${blocked} detenido(s) por la configuración de la organización; no se reintentarán solos.` : "";
      setSyncMessage((syncError ?? (completed.length ? `${completed.length} registro(s) sincronizado(s). ${remaining} pendiente(s).` : blocked ? "Sin registros por enviar." : "No se pudo sincronizar aún. Revisa la conexión y los datos.")) + blockedNote);
      if (completed.length) await Promise.all([sponsoredQuery.refetch(), placementChildrenQuery.refetch(), assistedQuery.refetch()]);
    } catch {
      setSyncMessage("No se pudo sincronizar. Los registros siguen guardados en este teléfono.");
    } finally {
      setSyncing(false);
    }
  }
  async function reloadPending() {
    if (!user || !activeOrganization) return;
    setPendingItems(await listPendingAssisted(user.id, activeOrganization.id));
  }

  async function discardPending(item: PendingAssistedEnrollment) {
    if (checkingId) return;
    setCheckingId(item.input.client_request_id);
    let check: Awaited<ReturnType<typeof checkServerBeforeDiscard>>;
    try {
      check = await checkServerBeforeDiscard(item);
    } finally {
      setCheckingId(null);
    }
    Alert.alert("Descartar registro guardado", discardConfirmation(item, check), [
      { text: "Cancelar", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => {
        void removePendingAssisted(item.input.client_request_id).then(reloadPending).catch(() => setSyncMessage("No se pudo eliminar la copia local."));
      } },
    ]);
  }

  function retryPending(item: PendingAssistedEnrollment) {
    void retryBlockedAssisted(item.input.client_request_id).then(reloadPending).catch(() => setSyncMessage("No se pudo reactivar el envío."));
  }

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
    if (!personal) {
      // Nothing personal to refresh; the management list refreshes with its own pull.
      setRefreshing(false);
      return;
    }
    if (user && activeOrganization) {
      try {
        const items = await listPendingAssisted(user.id, activeOrganization.id);
        setPendingItems(items);
      } catch { /* The network screen remains usable if device storage fails. */ }
    }
    try {
      await Promise.all([
        affiliateQuery.refetch(),
        sponsorQuery.refetch(),
        placementParentQuery.refetch(),
        sponsoredQuery.refetch(),
        placementChildrenQuery.refetch(),
        invitationsQuery.refetch(),
        assistedQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const forbidden = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "forbidden";
  const loadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile && !forbidden;

  const visiblePending = pendingItems.filter((item) => item.sponsorUserId === user?.id && item.organizationId === activeOrganization?.id);
  const assistedSection = user && activeOrganization && personal ? (
    <>
      <Button label="Registrar a alguien" variant="secondary" onPress={() => router.push("/assisted-enrollment" as never)} />
          {visiblePending.length > 0 ? (
            <Card style={styles.pendingCard}>
              <Text style={styles.pendingText}>{visiblePending.length} registro(s) pendiente(s) de sincronizar. Revisa la INE guardada y recupera la conexión para enviar.</Text>
              {visiblePending.map((item) => (
                <View key={item.input.client_request_id} style={styles.pendingCard}>
                  <Text style={styles.pendingText}>{item.input.first_name} {item.input.last_name}</Text>
                  {item.blocked ? (
                    <>
                      <Text accessibilityRole="alert" style={styles.pendingHeading}>{blockedExplanation(item.blocked.reason).title}</Text>
                      <Text style={styles.pendingText}>{blockedExplanation(item.blocked.reason).description}</Text>
                      {canRetryBlocked(item.blocked.reason) ? <Button label="Reintentar envío" variant="secondary" disabled={syncing} onPress={() => retryPending(item)} /> : null}
                      {checkingId === item.input.client_request_id ? <Text accessibilityLiveRegion="polite" style={styles.pendingText}>Comprobando en el servidor…</Text> : null}
                      <Button label="Descartar" variant="danger" disabled={syncing || Boolean(checkingId)} loading={checkingId === item.input.client_request_id} onPress={() => void discardPending(item)} />
                    </>
                  ) : null}
                  <Button label="Capturar o revisar INE guardada" variant="secondary" disabled={syncing}
                    onPress={() => router.push(`/assisted-offline/${item.input.client_request_id}` as never)} />
                </View>
              ))}
              <Button label="Sincronizar registros pendientes" loading={syncing} onPress={() => void syncPending()} />
            </Card>
          ) : null}
          {syncMessage ? <Text style={styles.pendingText}>{syncMessage}</Text> : null}
          {assistedQuery.isError ? (
            <ErrorState error={assistedQuery.error} onRetry={() => void assistedQuery.refetch()} />
          ) : assistedQuery.data && assistedQuery.data.data.length > 0 ? (
            <Card style={styles.pendingCard}>
              <Text style={styles.pendingHeading}>Registros asistidos · acceso pendiente</Text>
              <Text style={styles.pendingText}>Puedes continuar la verificación desde aquí antes de que activen su cuenta.</Text>
              {assistedQuery.data.data.map((item) => (
                <View key={item.id} style={styles.pendingCard}>
                  <Text style={styles.pendingText}>{item.first_name} {item.last_name} · {item.affiliate_code}</Text>
                  <Button label="Continuar verificación" variant="secondary"
                    onPress={() => router.push(`/assisted-verification/${item.id}` as never)} />
                </View>
              ))}
              {assistedPage > 1 ? <Button label="Registros anteriores" variant="ghost" onPress={() => setAssistedPage((page) => page - 1)} /> : null}
              {assistedPage < assistedQuery.data.meta.last_page ? <Button label="Más registros" variant="ghost" onPress={() => setAssistedPage((page) => page + 1)} /> : null}
            </Card>
          ) : null}
    </>
  ) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="network-scroll"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
    >
      <Text style={styles.heading}>{strings.network.title}</Text>
      <ActiveOrganizationBar />
      {!personal ? (
        <>
          <Card style={styles.pendingCard} testID="staff-without-profile">
            <Text style={styles.pendingHeading}>{strings.staffWithoutProfile.title}</Text>
            <Text style={styles.pendingText}>{strings.staffWithoutProfile.description}</Text>
          </Card>
          {/* Keyed by account+organization: switching either clears the search and its results. */}
          {staff ? <OrganizationAffiliatesSection key={`organization-affiliates:${user?.id}:${activeOrganization?.id}`} /> : null}
        </>
      ) : (
        <>
      {staff ? (
        <Button label={strings.organizationAffiliates.open} variant="secondary" onPress={() => router.push(routes.organizationAffiliates as never)} />
      ) : null}
      {!affiliateQuery.data || loadFailed || forbidden ? assistedSection : null}

      {affiliateQuery.isPending ? (
        <SkeletonGroup lines={4} />
      ) : noAffiliateProfile ? (
        <EmptyState title={strings.joinAffiliateProgram.title} description={strings.network.joinAffiliateDescription} />
      ) : forbidden ? (
        <ForbiddenState area={strings.network.forbiddenArea} />
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
            label={strings.network.inviteSomeone}
            iconLeft={<Icon name="compartir" size={16} color={colors.textOnBrand} />}
            onPress={pressInvite}
          />

          {assistedSection}

          <SectionCard
            title={strings.network.sponsor.title}
            helpText={strings.network.sponsor.helpText}
            query={sponsorQuery}
            isEmpty={(sponsor) => sponsor === null}
            emptyTitle={strings.network.sponsor.emptyTitle}
            emptyDescription={strings.network.sponsor.emptyDescription}
          >
            {(sponsor) => (sponsor ? <AffiliateRow affiliate={sponsor} /> : null)}
          </SectionCard>

          <SectionCard
            title={strings.network.placementParent.title}
            helpText={strings.network.placementParent.helpText}
            query={placementParentQuery}
            isEmpty={(parent) => parent === null}
            emptyTitle={strings.network.placementParent.emptyTitle}
          >
            {(parent) => (parent ? <AffiliateRow affiliate={parent} /> : null)}
          </SectionCard>

          {/* Keyed by account+organization: switching either clears the search text and its results. */}
          <NetworkSearchSection
            key={`sponsored:${user?.id}:${activeOrganization?.id}`}
            scope="sponsored"
            title={strings.network.directSponsored.title}
            helpText={strings.network.directSponsored.helpText}
            listQuery={sponsoredQuery}
            emptyTitle={strings.network.directSponsored.emptyTitle}
            onLoadMorePress={() => analytics.capture("network_load_more", { section: "sponsored" })}
            onOpen={openAffiliate}
          />

          <NetworkSearchSection
            key={`placement-children:${user?.id}:${activeOrganization?.id}`}
            scope="placement-children"
            title={strings.network.placementChildren.title}
            helpText={strings.network.placementChildren.helpText}
            listQuery={placementChildrenQuery}
            emptyTitle={strings.network.placementChildren.emptyTitle}
            onLoadMorePress={() => analytics.capture("network_load_more", { section: "placement_children" })}
            onOpen={openAffiliate}
          />

          <SectionCard
            title={strings.network.myInvitations.title}
            query={invitationsQuery}
            isEmpty={(page) => page.data.length === 0}
            emptyTitle={strings.network.myInvitations.emptyTitle}
            emptyDescription={strings.network.myInvitations.emptyDescription}
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
        </>
      )}
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
        <Text style={styles.code} accessibilityLabel={strings.referral.affiliateCodeA11y(affiliate.affiliate_code)}>
          {affiliate.affiliate_code}
        </Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <View style={styles.summaryGrid}>
        <SummaryStat label={strings.network.summary.sponsored} value={sponsoredTotal} />
        <SummaryStat label={strings.network.summary.placement} value={placementChildrenTotal} />
        <SummaryStat label={strings.network.summary.invitations} value={invitationsTotal} />
      </View>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value?: number }) {
  return (
    <View
      style={styles.summaryStat}
      accessible
      accessibilityLabel={`${label}: ${value ?? strings.network.summary.unavailable}`}
    >
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
  pendingCard: { gap: spacing.sm },
  pendingHeading: { ...typography.bodyStrong, color: colors.textPrimary },
  pendingText: { ...typography.body, color: colors.textSecondary },
  invitationsList: {
    gap: spacing.sm,
  },
});
