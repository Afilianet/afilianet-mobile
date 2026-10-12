import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage } from "../../api/access";
import { useAuth } from "../../auth/AuthContext";
import { usePendingReferral } from "../../auth/pendingReferral";
import { PhoneField } from "../../components/account/PhoneField";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Logo } from "../../design-system/icons/Logo";
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

  async function submit() {
    if (submitting) return;
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
    setError(problem);
    if (problem) return;

    setSubmitting(true);
    try {
      await register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        password,
        password_confirmation: confirmation,
      });
    } catch (cause) {
      setError(accessErrorMessage(cause));
    } finally {
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
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label={copy.submit} size="lg" fullWidth loading={submitting} onPress={() => void submit()} />
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
