import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { acceptReferralAsCurrentUser, accessErrorMessage } from "../../../api/access";
import { fetchPublicReferral, startReferralInvitation, type PublicReferral } from "../../../api/endpoints";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useAuth } from "../../../auth/AuthContext";
import { clearPendingReferral, savePendingReferral } from "../../../auth/pendingReferral";
import { useSafeSignOut } from "../../../features/surveys/signOut";
import { PhoneField } from "../../../components/account/PhoneField";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextInput } from "../../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../../components/ui/theme";
import { Logo } from "../../../design-system/icons/Logo";
import { strings } from "../../../i18n";
import { routes } from "../../../navigation/routes";
import { useOrganization } from "../../../state/OrganizationContext";
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
  }, [organizationId, code, key, mode]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Logo variant="violeta" height={32} />
        </View>
        {loading ? <Text style={styles.info}>{strings.shared.loading}</Text> : null}
        {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
        {referral && mode === "member" ? (
          <JoinWithAccount organizationId={organizationId} code={code} referral={referral} />
        ) : null}
        {referral && mode === "visitor" ? <VisitorRegistration organizationId={organizationId} code={code} referral={referral} /> : null}
        {lookupError && mode === "member" ? <BackHome /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackHome() {
  const router = useRouter();
  return <Button label={strings.access.joinWithAccount.dismiss} variant="ghost" onPress={() => router.replace(routes.home as never)} />;
}

function JoinWithAccount({ organizationId, code, referral }: { organizationId: string; code: string; referral: PublicReferral }) {
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
  const alreadyMember = organizations.some((organization) => organization.id === organizationId);

  async function accept() {
    if (submitting || !user) return;
    const startedFor = user.id;
    // A sign-out or account switch mid-request must not continue in the new session.
    const stillSameSession = () => mounted.current && userIdRef.current === startedFor;
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await startReferralInvitation(organizationId, code);
      if (!stillSameSession()) return;
      await acceptReferralAsCurrentUser(token);
      if (!stillSameSession()) return;
      await clearPendingReferral();
      // Reloads memberships: with no previous organization the new one is
      // selected automatically; an already-active organization stays active
      // and the new one appears in the organization switcher.
      await refresh();
      if (stillSameSession()) router.replace(routes.home as never);
    } catch (cause) {
      if (!stillSameSession()) return;
      setError(isApiError(cause) && cause.kind === "conflict" ? copy.alreadyMember : accessErrorMessage(cause));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  async function dismiss() {
    await clearPendingReferral();
    router.replace(routes.home as never);
  }

  return (
    <Card style={styles.form}>
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.info}>{copy.invitedBy(referral.referrer_first_name)}</Text>
      {user ? <Text style={styles.info}>{copy.description(`${user.first_name} ${user.last_name}`.trim())}</Text> : null}
      {alreadyMember ? <Text style={styles.info}>{copy.alreadyMember}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!alreadyMember ? <Button label={copy.accept} size="lg" fullWidth loading={submitting} onPress={() => void accept()} /> : null}
      <Button label={copy.dismiss} variant="ghost" disabled={submitting} onPress={() => void dismiss()} />
      <Button label={copy.notYou} variant="ghost" disabled={submitting} onPress={() => void signOut()} />
    </Card>
  );
}

function VisitorRegistration({ organizationId, code, referral }: { organizationId: string; code: string; referral: PublicReferral }) {
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

  async function submit() {
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
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (invitationToken.current?.key !== key) {
        invitationToken.current = { key, token: (await startReferralInvitation(organizationId, code)).token };
      }
      if (!invitationToken.current.token) throw new Error("Missing invitation token");
      await registerFromReferral(invitationToken.current.token, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        password,
      });
      // The account was created already inside this organization: nothing is pending anymore.
      await clearPendingReferral();
      router.replace(routes.verifyAccount as never);
    } catch (error) {
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
      {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
      <Button label={strings.auth.join.submit} size="lg" fullWidth loading={submitting} onPress={() => void submit()} />
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
