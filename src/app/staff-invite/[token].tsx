import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { acceptStaffInvitation, fetchStaffInvitation, type StaffInvitation } from "../../api/endpoints";
import { friendlyMessage, isApiError } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { colors, spacing, typography } from "../../components/ui/theme";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { useOrganization } from "../../state/OrganizationContext";

/**
 * Accepts a staff invitation (owner/admin invites someone to join their
 * organization) using the viewer's EXISTING signed-in account -- distinct
 * from src/app/join/[organizationId]/[code].tsx, which is the unrelated
 * affiliate-referral registration flow for a brand-new account. The
 * backend already supports this identity-matched-by-email acceptance with
 * no changes needed (see acceptStaffInvitation's docblock) -- this screen
 * is the missing client for it.
 *
 * A signed-out visitor is prompted to sign in first rather than this
 * screen attempting to resume the acceptance automatically afterward --
 * re-opening the same invitation link once signed in completes it. This is
 * a deliberate v1 scope limit, not an oversight (see the Phase delivery
 * report for the exact follow-up this implies for however invitation
 * links are actually delivered/opened on a device).
 */
export default function StaffInviteScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status: authStatus } = useAuth();
  const { refresh } = useOrganization();

  const [invitation, setInvitation] = useState<StaffInvitation | null>(null);
  const [loadError, setLoadError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    let current = true;
    if (!token) return;
    fetchStaffInvitation(token)
      .then((data) => { if (current) setInvitation(data); })
      .catch(() => { if (current) setLoadError(strings.staffInvite.notFound); });
    return () => { current = false; };
  }, [token]);

  async function accept() {
    if (!token || accepting) return;
    setAccepting(true);
    setAcceptError("");
    try {
      await acceptStaffInvitation(token, { authenticated: true });
      setAccepted(true);
      await refresh();
    } catch (cause) {
      setAcceptError(isApiError(cause) ? friendlyMessage(cause) : strings.staffInvite.genericError);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{strings.staffInvite.title}</Text>

      {!invitation && !loadError ? <Text style={styles.body}>{strings.staffInvite.loading}</Text> : null}
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {invitation ? (
        accepted ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {strings.staffInvite.accepted(invitation.organization.name)}
            </Text>
            <Button label={strings.staffInvite.goHome} onPress={() => router.replace(routes.home as never)} />
          </>
        ) : (
          <>
            <Text style={styles.body}>{invitation.organization.name}</Text>
            <Text style={styles.meta}>
              {strings.staffInvite.roleLabel}: {invitation.role}
            </Text>
            {authStatus === "signedIn" ? (
              <Button
                label={strings.staffInvite.acceptAs(invitation.organization.name)}
                loading={accepting}
                onPress={() => void accept()}
              />
            ) : (
              <>
                <Text style={styles.body}>{strings.staffInvite.signInToAccept}</Text>
                <Button label={strings.staffInvite.signIn} onPress={() => router.push(routes.login as never)} />
              </>
            )}
            {acceptError ? <Text style={styles.error}>{acceptError}</Text> : null}
          </>
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.body, color: colors.danger },
});
