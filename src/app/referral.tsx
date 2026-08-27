import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { isApiError } from "../api/errors";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ForbiddenState } from "../components/ForbiddenState";
import { SkeletonGroup } from "../components/Skeleton";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Toast } from "../components/ui/Toast";
import { Icon } from "../design-system/icons/Icon";
import { Isotipo } from "../design-system/icons/Logo";
import { affiliateStatusCopy } from "../design-system/statusMapping";
import { fontSize } from "../design-system/tokens";
import { useAffiliateProfile } from "../hooks/useAffiliateProfile";
import { routes } from "../navigation/routes";
import { analytics } from "../services/analytics";
import type { AffiliateProfile } from "../types/api";
import { buildReferralUrl, canShareReferral } from "../utils/referral";

export default function ReferralScreen() {
  const router = useRouter();
  const affiliateQuery = useAffiliateProfile();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await affiliateQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    analytics.capture("referral_screen_viewed");
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2200);
  }

  const noAffiliateProfile = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "not_found";
  const forbidden = isApiError(affiliateQuery.error) && affiliateQuery.error.kind === "forbidden";
  const loadFailed = isApiError(affiliateQuery.error) && !noAffiliateProfile && !forbidden;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        testID="referral-scroll"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={styles.close}>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {affiliateQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : noAffiliateProfile ? (
          <EmptyState
            title="Join the affiliate program"
            description="You need an affiliate profile in this organization to get a referral link."
          />
        ) : forbidden ? (
          <ForbiddenState area="your referral link" />
        ) : loadFailed ? (
          <ErrorState
            error={affiliateQuery.error}
            onRetry={() => void affiliateQuery.refetch()}
            retrying={affiliateQuery.isFetching}
          />
        ) : affiliateQuery.data ? (
          <ReferralBody
            affiliate={affiliateQuery.data}
            onCopied={() => showToast("Link copied")}
            onViewInvitations={() => router.push(routes.network as never)}
          />
        ) : null}
      </ScrollView>

      {toastMessage ? <Toast message={toastMessage} tone="success" /> : null}
    </View>
  );
}

function ReferralBody({
  affiliate,
  onCopied,
  onViewInvitations,
}: {
  affiliate: AffiliateProfile;
  onCopied: () => void;
  onViewInvitations: () => void;
}) {
  const status = affiliateStatusCopy(affiliate.status);
  const shareable = canShareReferral(affiliate.status);
  const url = buildReferralUrl(affiliate.affiliate_code);

  const qrViewedRef = useRef(false);
  useEffect(() => {
    if (shareable && !qrViewedRef.current) {
      qrViewedRef.current = true;
      analytics.capture("referral_qr_viewed");
    }
  }, [shareable]);

  async function handleShare() {
    analytics.capture("referral_share_opened");
    try {
      const message = `Join me on Afilianet: ${url}`;
      await Share.share(Platform.OS === "ios" ? { message, url } : { message });
    } catch {
      // The user dismissed the share sheet, or the OS share call failed --
      // nothing to recover from or surface as an error.
    }
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(url);
    analytics.capture("referral_link_copied");
    onCopied();
  }

  return (
    <View style={styles.body}>
      <View style={styles.brand}>
        <Isotipo variant="violeta" size={40} />
      </View>

      {affiliate.status !== "active" ? (
        <Card style={styles.statusCard}>
          <Badge label={status.label} tone={status.tone} />
          <Text style={styles.statusMessage}>
            {shareable
              ? "Your account is still being reviewed, but your referral link already works."
              : "Referral sharing is unavailable while your account is in this status."}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.label}>Your affiliate code</Text>
        <Text style={styles.code} selectable accessibilityLabel={`Affiliate code ${affiliate.affiliate_code}`}>
          {affiliate.affiliate_code}
        </Text>
      </Card>

      {shareable ? (
        <>
          <View
            style={styles.qrFrame}
            accessible
            accessibilityLabel={`QR code for your referral link: ${url}`}
          >
            <View style={styles.qrQuietZone}>
              <QRCode value={url} size={188} color="#0C0A14" backgroundColor="#FFFFFF" ecl="Q" />
            </View>
          </View>

          <Card style={styles.card}>
            <Text style={styles.label}>Referral link</Text>
            <Text style={styles.url} selectable numberOfLines={1} accessibilityLabel={`Referral link ${url}`}>
              {url}
            </Text>
          </Card>

          <View style={styles.actions}>
            <Button
              label="Share"
              variant="primary"
              size="lg"
              fullWidth
              iconLeft={<Icon name="compartir" size={18} color={colors.textOnBrand} />}
              onPress={() => void handleShare()}
            />
            <Button
              label="Copy link"
              variant="secondary"
              size="md"
              fullWidth
              iconLeft={<Icon name="enlace" size={16} color={colors.textPrimary} />}
              onPress={() => void handleCopy()}
            />
          </View>
        </>
      ) : null}

      <InvitationsSection onViewInvitations={onViewInvitations} />
    </View>
  );
}

/**
 * Self-scoped invitation tracking (GET /api/v1/affiliates/me/invitations) is
 * real and already surfaced in full on the Network tab's "My invitations"
 * section -- this card is just a pointer from Referral to that existing
 * list, not a duplicate of it.
 */
function InvitationsSection({ onViewInvitations }: { onViewInvitations: () => void }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>My invitations</Text>
      <Text style={styles.invitationsMessage}>
        See who you&apos;ve invited and their status under Network.
      </Text>
      <Button label="View invitations" variant="secondary" size="sm" onPress={onViewInvitations} />
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
  body: {
    gap: spacing.md,
  },
  brand: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  statusCard: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  statusMessage: {
    ...typography.body,
    color: colors.textSecondary,
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
  code: {
    ...typography.numeric,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  url: {
    ...typography.numeric,
    color: colors.textSecondary,
  },
  qrFrame: {
    alignSelf: "center",
    padding: spacing.sm,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "#FFFFFF",
  },
  qrQuietZone: {
    padding: spacing.sm,
    backgroundColor: "#FFFFFF",
  },
  actions: {
    gap: spacing.sm,
  },
  invitationsMessage: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
