import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { acceptStaffInvitation, fetchStaffInvitation, type StaffInvitation } from "../../api/endpoints";
import { friendlyMessage, isApiError } from "../../api/errors";
import { fetchMyPrivacy, isNoticeOutdated, needsGeneralNotice } from "../../api/privacy";
import { useAuth } from "../../auth/AuthContext";
import { StepNoticesView } from "../../components/privacy/StepNoticesView";
import { Button } from "../../components/ui/Button";
import { colors, spacing, typography } from "../../components/ui/theme";
import { useAttemptId } from "../../hooks/useAttemptId";
import { useStepNotices } from "../../hooks/useStepNotices";
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
  // API #91: a notice that changed while this was open is read again from the same lookup.
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const signedIn = authStatus === "signedIn";
  const block = invitation?.privacy;
  const [fetchedNeedsGeneral, setFetchedNeedsGeneral] = useState<boolean | null>(null);
  const hasBlock = Boolean(block);
  const required = Boolean(block?.required);
  // Without a block (an API before #91) nothing more is needed; otherwise GET /me/privacy says.
  const needsGeneral = !signedIn || !invitation ? null : hasBlock ? fetchedNeedsGeneral : false;
  const notices = useStepNotices({
    enabled: signedIn && needsGeneral !== null,
    withOrganization: true,
    block,
    organizationName: invitation?.organization.name,
    general: "when-needed",
    needsGeneral: Boolean(needsGeneral),
  });
  const attemptId = useAttemptId();
  const busy = useRef(false);
  const noticesReady = needsGeneral !== null && notices.status !== "loading" && !notices.blockedMessage;

  useEffect(() => {
    let current = true;
    if (!token) return;
    fetchStaffInvitation(token)
      .then((data) => { if (current) setInvitation(data); })
      .catch(() => { if (current) setLoadError(strings.staffInvite.notFound); });
    return () => { current = false; };
  }, [token, lookupAttempt]);

  // The general notice only when this account still has to see it (contract §4);
  // without that answer, whenever the step requires notices.
  useEffect(() => {
    if (!signedIn || !hasBlock) return;
    let current = true;
    fetchMyPrivacy()
      .then((status) => { if (current) setFetchedNeedsGeneral(status ? status.privacy_notice.action_required !== "none" : required); })
      .catch(() => { if (current) setFetchedNeedsGeneral(required); });
    return () => { current = false; };
  }, [signedIn, hasBlock, required]);

  async function accept() {
    if (!token || busy.current || !noticesReady) return;
    if (!notices.canSend) {
      setAcceptError(strings.privacyNotices.step.mustConfirm);
      return;
    }
    busy.current = true;
    setAccepting(true);
    setAcceptError("");
    try {
      const refs = notices.refs();
      const sendsNotices = Boolean(refs.privacy_notice || refs.organization_notice);
      await acceptStaffInvitation(token, {
        authenticated: true,
        notices: sendsNotices ? { ...refs, client_request_id: attemptId(token) } : undefined,
      });
      setAccepted(true);
      await refresh();
    } catch (cause) {
      // API #91: nothing was written; show the current notices and keep the attempt.
      if (isNoticeOutdated(cause)) {
        setLookupAttempt((value) => value + 1);
        notices.reload();
      } else if (needsGeneralNotice(cause)) {
        notices.reload({ requireGeneral: true });
      }
      setAcceptError(isApiError(cause) ? (needsGeneralNotice(cause) ? strings.privacyNotices.step.generalNeeded : friendlyMessage(cause)) : strings.staffInvite.genericError);
    } finally {
      busy.current = false;
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
            {signedIn ? (
              <>
                {needsGeneral === null ? <Text style={styles.body}>{strings.privacyNotices.step.loading}</Text> : <StepNoticesView notices={notices} />}
                <Button
                  label={strings.staffInvite.acceptAs(invitation.organization.name)}
                  loading={accepting}
                  disabled={!noticesReady}
                  onPress={() => void accept()}
                />
              </>
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
