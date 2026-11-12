import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { accessErrorMessage, enrollAsOwner, fetchOwnerEnrollment, type OwnerEnrollmentStep } from "../api/access";
import { isApiError } from "../api/errors";
import { isNoticeOutdated, needsGeneralNotice } from "../api/privacy";
import { useAuth } from "../auth/AuthContext";
import { RegistrationConsentsView } from "../components/privacy/RegistrationConsentsView";
import { StepNoticesView } from "../components/privacy/StepNoticesView";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { useAttemptId } from "../hooks/useAttemptId";
import { useRegistrationConsents } from "../hooks/useRegistrationConsents";
import { useStepNotices } from "../hooks/useStepNotices";
import { strings } from "../i18n";
import { closeTo } from "../navigation/rootNavigation";
import { routes } from "../navigation/routes";
import { useOrganization } from "../state/OrganizationContext";

type Answer = { key: string; step?: OwnerEnrollmentStep; failed?: boolean; notOwner?: boolean };

/**
 * «Incorporarme como afiliado» (API #158, OWNER_AFFILIATE_ENROLLMENT.md): the
 * active owner creates their OWN affiliate profile in the active organization,
 * in their own session. The step shows the notices the server lists (compact,
 * as in sign-up), the optional purpose boxes, and sends exactly what was
 * shown. It keeps the owner role, starts no KYC and captures nothing.
 */
export default function OwnerEnrollmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrganization, refresh, reloadOrganizations } = useOrganization();
  const copy = strings.ownerEnrollment;
  const organizationId = activeOrganization?.id;
  const [attempt, setAttempt] = useState(0);
  // The answer for one request only: a reload shows "loading" until its own answer arrives.
  const [answer, setAnswer] = useState<Answer | null>(null);
  const requestKey = `${organizationId ?? ""}:${attempt}`;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyAffiliated, setAlreadyAffiliated] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    let current = true;
    fetchOwnerEnrollment(organizationId)
      .then((step) => { if (current) setAnswer({ key: requestKey, step }); })
      .catch((cause) => {
        if (!current) return;
        setAnswer(isApiError(cause) && cause.reason === "not_owner" ? { key: requestKey, notOwner: true } : { key: requestKey, failed: true });
      });
    return () => { current = false; };
  }, [organizationId, requestKey]);

  const current = answer?.key === requestKey ? answer : null;
  const load = !current ? "loading" : current.failed ? "error" : "ready";
  const step: OwnerEnrollmentStep | null = current?.step ?? (current?.notOwner ? { available: false, reason: null, pending_from_creation: false, privacy: null } : null);
  const notices = useStepNotices({
    enabled: Boolean(step?.available),
    withOrganization: true,
    block: step?.privacy ?? null,
    organizationName: activeOrganization?.name,
    general: "when-needed",
    needsGeneral: Boolean(step?.privacy?.general_required),
  });
  const consents = useRegistrationConsents(notices);
  const attemptId = useAttemptId();
  const noticesReady = notices.status !== "loading" && !notices.blockedMessage;

  async function backHome() {
    await (reloadOrganizations ? reloadOrganizations() : refresh());
    if (mounted.current) closeTo(router, routes.home);
  }

  async function submit() {
    if (busy.current || !user || !organizationId || !step?.available || !noticesReady) return;
    if (!notices.canSend) {
      setError(strings.privacyNotices.step.mustConfirm);
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const refs = notices.refs();
      const decisions = consents.consents();
      const result = await enrollAsOwner(organizationId, {
        ...refs,
        ...(decisions.length ? { consents: decisions } : {}),
        client_request_id: attemptId(`${user.id}/${organizationId}/owner-enrollment`),
      });
      if (!mounted.current) return;
      if (result.already_affiliated) {
        // Nothing was created or changed: say so instead of moving on silently.
        setAlreadyAffiliated(true);
        await (reloadOrganizations ? reloadOrganizations() : refresh());
        return;
      }
      // The list now says the owner has a profile: Home shows the personal cards.
      await backHome();
    } catch (cause) {
      if (!mounted.current) return;
      if (isNoticeOutdated(cause)) {
        notices.reload();
        setAttempt((value) => value + 1);
      } else if (needsGeneralNotice(cause)) {
        notices.reload({ requireGeneral: true });
      }
      if (isApiError(cause) && cause.reason === "not_owner") setError(copy.notOwner);
      else if (isApiError(cause) && cause.reason === "organization_inactive") setError(copy.inactive);
      else setError(accessErrorMessage(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="owner-enrollment">
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      {load === "loading" ? <Text style={styles.info}>{copy.loading}</Text> : null}
      {load === "error" ? (
        <Card style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>{copy.loadFailed}</Text>
          <Button label={copy.retry} variant="secondary" onPress={() => setAttempt((value) => value + 1)} />
        </Card>
      ) : null}
      {alreadyAffiliated || (step && !step.available && step.reason === "already_affiliated") ? (
        <Card style={styles.card} testID="owner-enrollment-already">
          <Text style={styles.info}>{copy.alreadyAffiliated}</Text>
          <Button label={copy.goHome} onPress={() => void backHome()} />
        </Card>
      ) : step && !step.available ? (
        <Card style={styles.card} testID="owner-enrollment-unavailable">
          <Text style={styles.info}>{step.reason === "organization_inactive" ? copy.inactive : copy.notOwner}</Text>
          <Button label={copy.goHome} variant="secondary" onPress={() => closeTo(router, routes.home)} />
        </Card>
      ) : step ? (
        <>
          <Text style={styles.info}>{copy.description}</Text>
          <StepNoticesView notices={notices} disabled={submitting} />
          <RegistrationConsentsView consents={consents} disabled={submitting} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label={copy.submit} size="lg" fullWidth loading={submitting} disabled={!noticesReady} onPress={() => void submit()} />
          <Button label={copy.cancel} variant="ghost" disabled={submitting} onPress={() => closeTo(router, routes.home)} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  card: { gap: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  info: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
