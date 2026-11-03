import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { acceptReferralAsCurrentUser, accessErrorMessage, isAlreadyEnrolledError } from "../../../api/access";
import { fetchPublicReferral, startReferralInvitation, type PublicReferral } from "../../../api/endpoints";
import { fetchMyPrivacy, isNoticeOutdated, needsGeneralNotice, PRIVACY_NOTICE_OUTDATED } from "../../../api/privacy";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useAuth } from "../../../auth/AuthContext";
import { clearPendingReferral, savePendingReferral } from "../../../auth/pendingReferral";
import { useSafeSignOut } from "../../../features/surveys/signOut";
import { PhoneField } from "../../../components/account/PhoneField";
import { StepNoticesView } from "../../../components/privacy/StepNoticesView";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextInput } from "../../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../../components/ui/theme";
import { Logo } from "../../../design-system/icons/Logo";
import { useAttemptId } from "../../../hooks/useAttemptId";
import { useStepNotices } from "../../../hooks/useStepNotices";
import { strings } from "../../../i18n";
import { routes } from "../../../navigation/routes";
import { useOrganization } from "../../../state/OrganizationContext";
import { affiliateProfilePresence } from "../../../state/membership";
import { DEFAULT_PHONE_COUNTRY, normalizePhone } from "../../../utils/phone";

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * A referral link (deep link afilianetmobile://join/{organization}/{code},
 * the staging HTTPS landing, or a typed code via InvitationFinder).
 *
 * Signed out: the referral is kept pending (auth/pendingReferral.ts) so it
 * survives "Ya tengo cuenta" -> sign-in, or direct sign-up -> verification;
 * or the visitor registers right here with email, mobile or both.
 *
 * Signed in: the person joins with the CURRENT account -- the API's
 * authenticated accept never creates a second account.
 */
export default function JoinScreen() {
  const { organizationId, code } = useLocalSearchParams<{ organizationId: string; code: string }>();
  const { status } = useAuth();
  const key = `${organizationId}/${code}`;
  const [lookup, setLookup] = useState<{ key: string; referral?: PublicReferral; error?: string } | null>(null);
  const referral = lookup?.key === key ? lookup.referral : null;
  const lookupError =
    !organizationId || !code ? strings.auth.join.invalidLink : lookup?.key === key ? lookup.error : null;
  const loading = Boolean(organizationId && code && lookup?.key !== key);
  // Fixed for this screen's lifetime: a referral registration below flips the
  // session to signed in, and must not swap this form for the "join with your
  // account" view in the middle of it.
  const [mode] = useState<"visitor" | "member">(status === "signedIn" ? "member" : "visitor");
  // API #91: a notice that changed while the form was open is read again from
  // the same lookup; the form below stays mounted with what was typed.
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const reloadReferral = () => setLookupAttempt((value) => value + 1);

  useEffect(() => {
    let active = true;
    if (!organizationId || !code) return;
    void fetchPublicReferral(organizationId, code)
      .then((value) => {
        if (!active) return;
        setLookup({ key, referral: value });
        if (mode === "visitor") void savePendingReferral(organizationId, code);
      })
      .catch((error) => {
        if (active)
          setLookup({
            key,
            error:
              isApiError(error) && error.kind === "not_found"
                ? strings.auth.join.invalidLink
                : isApiError(error)
                  ? friendlyMessage(error)
                  : strings.shared.genericError,
          });
      });
    return () => {
      active = false;
    };
  }, [organizationId, code, key, mode, lookupAttempt]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Logo variant="violeta" height={32} />
        </View>
        {loading ? <Text style={styles.info}>{strings.shared.loading}</Text> : null}
        {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
        {referral && mode === "member" ? (
          <JoinWithAccount organizationId={organizationId} code={code} referral={referral} onNoticesChanged={reloadReferral} />
        ) : null}
        {referral && mode === "visitor" ? <VisitorRegistration organizationId={organizationId} code={code} referral={referral} onNoticesChanged={reloadReferral} /> : null}
        {lookupError && mode === "member" ? <BackHome /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackHome() {
  const router = useRouter();
  return <Button label={strings.access.joinWithAccount.dismiss} variant="ghost" onPress={() => router.replace(routes.home as never)} />;
}

interface JoinProps {
  organizationId: string;
  code: string;
  referral: PublicReferral;
  onNoticesChanged: () => void;
}

/**
 * Joining with a session shows the organization's supplement, and the general
 * notice only when this account still has to see it (GET /me/privacy, contract
 * §4 `needsGeneral`). Without that answer (an older API, offline) it is shown
 * whenever the step requires notices: sending one already seen records nothing new.
 */
function useNeedsGeneral(enabled: boolean, required: boolean): boolean | null {
  const [needs, setNeeds] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchMyPrivacy()
      .then((status) => {
        if (current) setNeeds(status ? status.privacy_notice.action_required !== "none" : required);
      })
      .catch(() => {
        if (current) setNeeds(required);
      });
    return () => {
      current = false;
    };
  }, [enabled, required]);
  return enabled ? needs : false;
}

function JoinWithAccount({ organizationId, code, referral, onNoticesChanged }: JoinProps) {
  const router = useRouter();
  const { user } = useAuth();
  const signOut = useSafeSignOut();
  const { refresh, organizations } = useOrganization();
  const copy = strings.access.joinWithAccount;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef(user?.id);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);
  // Belonging is not being affiliated: a manager without a profile there may
  // still join the network (API #75/#78). Only an unknown profile (an API
  // before #75) keeps the previous "already a member" reading.
  const membership = organizations.find((organization) => organization.id === organizationId);
  const presence = membership ? affiliateProfilePresence(membership) : null;
  const alreadyMember = presence === "present" || presence === "unknown";
  const memberWithoutProfile = presence === "absent";
  const [alreadyAffiliated, setAlreadyAffiliated] = useState(false);
  const block = referral.privacy;
  const needsGeneral = useNeedsGeneral(Boolean(block), Boolean(block?.required));
  const notices = useStepNotices({
    enabled: needsGeneral !== null,
    withOrganization: true,
    block,
    general: "when-needed",
    needsGeneral: Boolean(needsGeneral),
  });
  const attemptId = useAttemptId();
  const busy = useRef(false);
  const noticesReady = needsGeneral !== null && notices.status !== "loading" && !notices.blockedMessage;

  async function accept() {
    if (busy.current || !user || !noticesReady) return;
    if (!notices.canSend) {
      setError(strings.privacyNotices.step.mustConfirm);
      return;
    }
    busy.current = true;
    const startedFor = user.id;
    // A sign-out or account switch mid-request must not continue in the new session.
    const stillSameSession = () => mounted.current && userIdRef.current === startedFor;
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await startReferralInvitation(organizationId, code);
      if (!stillSameSession()) return;
      const refs = notices.refs();
      const sendsNotices = Boolean(refs.privacy_notice || refs.organization_notice);
      const result = await acceptReferralAsCurrentUser(
        token,
        sendsNotices ? { ...refs, client_request_id: attemptId(`${startedFor}/${organizationId}/${code}`) } : {},
      );
      if (!stillSameSession()) return;
      await clearPendingReferral();
      if (result?.already_affiliated) {
        // Nothing was created or changed: say so instead of moving on silently.
        await refresh();
        if (stillSameSession()) setAlreadyAffiliated(true);
        return;
      }
      // Reloads memberships: with no previous organization the new one is
      // selected automatically; an already-active organization stays active
      // and the new one appears in the organization switcher.
      await refresh();
      if (stillSameSession()) router.replace(routes.home as never);
    } catch (cause) {
      if (!stillSameSession()) return;
      if (isAlreadyEnrolledError(cause)) {
        await clearPendingReferral();
        setAlreadyAffiliated(true);
        return;
      }
      // API #91: nothing was written; show the current notices and keep the attempt.
      if (isNoticeOutdated(cause)) {
        onNoticesChanged();
        notices.reload();
      } else if (needsGeneralNotice(cause)) {
        notices.reload({ requireGeneral: true });
      }
      setError(isApiError(cause) && cause.kind === "conflict" && cause.reason !== PRIVACY_NOTICE_OUTDATED ? copy.alreadyMember : accessErrorMessage(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  async function dismiss() {
    await clearPendingReferral();
    router.replace(routes.home as never);
  }

  if (alreadyAffiliated) {
    return (
      <Card style={styles.form} testID="join-already-affiliated">
        <Text style={styles.title} accessibilityRole="header">{copy.alreadyAffiliatedTitle}</Text>
        <Text style={styles.info}>{copy.alreadyAffiliated}</Text>
        <Button label={copy.goHome} size="lg" fullWidth onPress={() => router.replace(routes.home as never)} />
      </Card>
    );
  }

  return (
    <Card style={styles.form}>
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.info}>{copy.invitedBy(referral.referrer_first_name)}</Text>
      {user ? <Text style={styles.info}>{copy.description(`${user.first_name} ${user.last_name}`.trim())}</Text> : null}
      {alreadyMember ? <Text style={styles.info}>{copy.alreadyMember}</Text> : null}
      {memberWithoutProfile ? <Text style={styles.info}>{copy.memberWithoutProfile}</Text> : null}
      {!alreadyMember && needsGeneral === null ? <Text style={styles.info}>{strings.privacyNotices.step.loading}</Text> : null}
      {!alreadyMember && needsGeneral !== null ? <StepNoticesView notices={notices} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!alreadyMember ? <Button label={copy.accept} size="lg" fullWidth loading={submitting} disabled={!noticesReady} onPress={() => void accept()} /> : null}
      <Button label={copy.dismiss} variant="ghost" disabled={submitting} onPress={() => void dismiss()} />
      <Button label={copy.notYou} variant="ghost" disabled={submitting} onPress={() => void signOut()} />
    </Card>
  );
}

function VisitorRegistration({ organizationId, code, referral, onNoticesChanged }: JoinProps) {
  const router = useRouter();
  const { registerFromReferral } = useAuth();
  const key = `${organizationId}/${code}`;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const invitationToken = useRef<{ key: string; token: string } | null>(null);
  // API #91: the general notice and this organization's supplement, read from
  // the referral's own block; without a block (an older API) nothing changes.
  const notices = useStepNotices({ enabled: true, withOrganization: true, block: referral.privacy, general: "always" });
  const noticesReady = notices.status !== "loading" && !notices.blockedMessage;
  const attemptId = useAttemptId();
  const busy = useRef(false);

  async function submit() {
    if (busy.current || !noticesReady) return;
    const normalizedEmail = email.trim().toLowerCase();
    const typedPhone = phone.trim();
    const normalizedPhone = typedPhone ? normalizePhone(country, typedPhone) : null;
    if (!firstName.trim() || !lastName.trim() || password.length < 8) {
      setSubmitError(strings.auth.join.checkFields);
      return;
    }
    if (!normalizedEmail && !typedPhone) {
      setSubmitError(strings.access.register.needOneChannel);
      return;
    }
    if ((normalizedEmail && !EMAIL.test(normalizedEmail)) || (typedPhone && !normalizedPhone)) {
      setSubmitError(strings.auth.join.checkFields);
      return;
    }
    if (password !== confirmation) {
      setSubmitError(strings.auth.join.passwordMismatch);
      return;
    }
    if (!notices.canSend) {
      setSubmitError(strings.privacyNotices.step.mustConfirm);
      return;
    }
    setSubmitError(null);
    busy.current = true;
    setSubmitting(true);
    try {
      if (invitationToken.current?.key !== key) {
        invitationToken.current = { key, token: (await startReferralInvitation(organizationId, code)).token };
      }
      if (!invitationToken.current.token) throw new Error("Missing invitation token");
      const input = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        password,
      };
      const refs = notices.refs();
      await registerFromReferral(invitationToken.current.token, {
        ...input,
        // Only with notices (an API with #91): the same id for every retry of this input.
        ...(refs.privacy_notice || refs.organization_notice
          ? { ...refs, client_request_id: attemptId(`${invitationToken.current.token}/${JSON.stringify(input)}`) }
          : {}),
      });
      // The account was created already inside this organization: nothing is pending anymore.
      await clearPendingReferral();
      router.replace(routes.verifyAccount as never);
    } catch (error) {
      // API #91: nothing was created; show the current notices, keep the form and the attempt.
      if (isNoticeOutdated(error)) {
        onNoticesChanged();
        notices.reload();
      }
      setSubmitError(
        isApiError(error)
          ? error.kind === "validation"
            ? error.message.startsWith("Ya existe")
              ? strings.auth.join.alreadyRegistered
              : accessErrorMessage(error)
            : friendlyMessage(error)
          : strings.shared.genericError,
      );
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{strings.auth.join.title}</Text>
      <Text style={styles.info}>{strings.auth.join.invitedBy(referral.referrer_first_name)}</Text>
      <TextInput label={strings.auth.join.firstName} value={firstName} onChangeText={setFirstName} textContentType="givenName" />
      <TextInput label={strings.auth.join.lastName} value={lastName} onChangeText={setLastName} textContentType="familyName" />
      <TextInput
        label={strings.auth.login.emailLabel}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
      />
      <PhoneField country={country} onCountryChange={setCountry} value={phone} onChangeText={setPhone} />
      <Text style={styles.info}>{strings.access.register.description}</Text>
      <TextInput label={strings.auth.login.passwordLabel} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
      <TextInput label={strings.auth.join.confirmPassword} value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" />
      <StepNoticesView notices={notices} />
      {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
      <Button label={strings.auth.join.submit} size="lg" fullWidth loading={submitting} disabled={!noticesReady} onPress={() => void submit()} />
      <Button label={strings.auth.join.signIn} variant="ghost" onPress={() => router.push(routes.login as never)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: measures.mobileGutter, gap: spacing.lg },
  brand: { alignItems: "center" },
  title: { ...typography.subtitle, color: colors.textPrimary, textAlign: "center" },
  info: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  form: { gap: spacing.md },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
});
