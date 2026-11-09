import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useSafeSignOut } from "../features/surveys/signOut";
import { pendingReferralPath, usePendingReferral } from "../auth/pendingReferral";
import { InvitationFinder } from "../components/account/InvitationFinder";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { strings } from "../i18n";
import { routes } from "../navigation/routes";
import { analytics } from "../services/analytics";

/**
 * Where RootNavigation (_layout.tsx) sends an authenticated user with ZERO
 * organization memberships -- a real, useful empty state (per the task's
 * "muestra un estado vacío útil en español, sin pantallas rotas") rather
 * than falling through to Home/Network, whose SectionCards are all
 * organization-gated and would otherwise sit in a permanent skeleton (a
 * disabled React Query is `isPending: true` forever -- see SectionCard's
 * own `enabled` prop). Fires NO tenant-scoped request at all -- every link
 * here is either account-level (profile) or platform-wide (notifications).
 */
export default function NoOrganizationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const signOut = useSafeSignOut();
  const pendingReferral = usePendingReferral();
  // Server state only: a channel counts as verified when the API says so.
  const hasUnverifiedChannel = Boolean(user && ((user.email && !user.email_verified_at) || (user.phone && !user.phone_verified_at)));

  useEffect(() => {
    analytics.capture("no_organization_viewed");
  }, []);

  return (
    <ScrollView testID="no-organization-scroll" style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{user ? strings.home.greeting(user.first_name) : strings.home.welcome}</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.title}>{strings.noOrganization.title}</Text>
        <Text style={styles.body}>{strings.noOrganization.description}</Text>
        <Text style={styles.body}>{strings.noOrganization.acceptInvitationHint}</Text>
        {/* No bottom bar here on purpose (docs/NAVEGACION_BARRA_INFERIOR_ES.md): say why, so it doesn't look unfinished. */}
        <Text style={styles.body}>{strings.noOrganization.sectionsAfterJoining}</Text>
      </Card>

      {pendingReferral ? (
        <Card style={styles.card}>
          <Text style={styles.body}>{strings.noOrganization.pendingInvitation}</Text>
          <Button label={strings.noOrganization.continueInvitation} onPress={() => router.push(pendingReferralPath(pendingReferral) as never)} />
        </Card>
      ) : null}
      {hasUnverifiedChannel ? (
        <Card style={styles.card}>
          <Text style={styles.body}>{strings.noOrganization.verifyPending}</Text>
          <Button label={strings.noOrganization.verifyAccount} variant="secondary" onPress={() => router.push(routes.verifyAccount as never)} />
        </Card>
      ) : null}
      <Card style={styles.card}>
        <Text style={styles.title}>{strings.access.joinLater.title}</Text>
        <Text style={styles.body}>{strings.access.joinLater.description}</Text>
        <InvitationFinder />
      </Card>
      <Button label={strings.noOrganization.viewNotifications} onPress={() => router.push(routes.platformNotifications as never)} />
      <Button label={strings.noOrganization.viewProfile} variant="secondary" onPress={() => router.push(routes.profile as never)} />
      <Button label={strings.profile.signOut} variant="ghost" onPress={() => void signOut()} />
    </ScrollView>
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
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  card: {
    gap: spacing.sm,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
