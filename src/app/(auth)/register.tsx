import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage } from "../../api/access";
import { isNoticeOutdated } from "../../api/privacy";
import { useAuth } from "../../auth/AuthContext";
import { usePendingReferral } from "../../auth/pendingReferral";
import { PhoneField } from "../../components/account/PhoneField";
import { StepNoticesView } from "../../components/privacy/StepNoticesView";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Logo } from "../../design-system/icons/Logo";
import { useAttemptId } from "../../hooks/useAttemptId";
import { useStepNotices } from "../../hooks/useStepNotices";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { DEFAULT_PHONE_COUNTRY, normalizePhone } from "../../utils/phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Direct sign-up: email, mobile or both (at least one), no referral and no
 * organization. On success the session starts and the root navigation
 * guard continues to /verify-account; a referral opened earlier stays
 * pending and is offered after verification.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const pendingReferral = usePendingReferral();
  const copy = strings.access.register;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // API #91: the general notice, shown before the account exists; an
  // unpublished notice (503) shows nothing and sends nothing, as before.
  const notices = useStepNotices({ enabled: true, withOrganization: false, general: "always" });
  const attemptId = useAttemptId();
  // A second tap before the first re-render must not send a second request.
  const busy = useRef(false);

  async function submit() {
    // A notice that failed to load is not sent (it was never shown); the server decides whether it was required.
    if (busy.current || notices.status === "loading") return;
    const normalizedEmail = email.trim().toLowerCase();
    const typedPhone = phone.trim();
    const normalizedPhone = typedPhone ? normalizePhone(country, typedPhone) : null;
    const nextFieldErrors: { email?: string; phone?: string } = {};
    if (normalizedEmail && !EMAIL.test(normalizedEmail)) nextFieldErrors.email = copy.invalidEmail;
    if (typedPhone && !normalizedPhone) nextFieldErrors.phone = copy.invalidPhone;
    setFieldErrors(nextFieldErrors);

    let problem: string | null = null;
    if (!firstName.trim() || !lastName.trim()) problem = copy.missingName;
    else if (!normalizedEmail && !typedPhone) problem = copy.needOneChannel;
    else if (nextFieldErrors.email || nextFieldErrors.phone) problem = strings.access.errors.checkFields;
    else if (password.length < 8) problem = copy.passwordTooShort;
    else if (password !== confirmation) problem = copy.passwordMismatch;
    else if (!notices.canSend) problem = strings.privacyNotices.step.mustConfirm;
    setError(problem);
    if (problem) return;

    const input = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      password,
      password_confirmation: confirmation,
    };
    const refs = notices.refs();
    busy.current = true;
    setSubmitting(true);
    try {
      await register({
        ...input,
        // Only with a notice (an API with #91): the same id for every retry of this input.
        ...(refs.privacy_notice ? { ...refs, client_request_id: attemptId(JSON.stringify(input)) } : {}),
      });
    } catch (cause) {
      // The notice changed while filling in the form: show the new one; the form stays.
      if (isNoticeOutdated(cause)) notices.reload();
      setError(accessErrorMessage(cause));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><Logo variant="violeta" height={32} /></View>
        <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
        <Text style={styles.description}>{copy.description}</Text>
        {pendingReferral ? <Text style={styles.notice}>{copy.referralBanner}</Text> : <Text style={styles.description}>{copy.noOrganizationNote}</Text>}
        <View style={styles.form}>
          <TextInput label={strings.access.firstNameLabel} value={firstName} onChangeText={setFirstName} textContentType="givenName" autoComplete="given-name" />
          <TextInput label={strings.access.lastNameLabel} value={lastName} onChangeText={setLastName} textContentType="familyName" autoComplete="family-name" />
          <TextInput
            label={strings.access.emailLabel}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <PhoneField country={country} onCountryChange={setCountry} value={phone} onChangeText={setPhone} error={fieldErrors.phone} />
          <TextInput label={strings.access.passwordLabel} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
          <TextInput label={strings.access.confirmPasswordLabel} value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" />
          <StepNoticesView notices={notices} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label={copy.submit} size="lg" fullWidth loading={submitting} disabled={notices.status === "loading"} onPress={() => void submit()} />
          <Button label={copy.withInvitation} variant="ghost" onPress={() => router.push(routes.invitation as never)} disabled={submitting} />
          <Button label={copy.haveAccount} variant="ghost" onPress={() => router.replace(routes.login as never)} disabled={submitting} />
          <Button label="Aviso de privacidad" variant="ghost" onPress={() => router.push("/privacy" as never)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: measures.mobileGutter, gap: spacing.lg },
  brand: { alignItems: "center" },
  title: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  notice: { ...typography.body, color: colors.textPrimary },
  form: { gap: spacing.md },
  error: { ...typography.caption, color: colors.danger },
});
