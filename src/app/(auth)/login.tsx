import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage } from "../../api/access";
import { loginErrorMessage } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { usePendingReferral } from "../../auth/pendingReferral";
import { ChannelToggle, type AccessChannel } from "../../components/account/ChannelToggle";
import { PhoneField } from "../../components/account/PhoneField";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Logo } from "../../design-system/icons/Logo";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { DEFAULT_PHONE_COUNTRY, normalizePhone } from "../../utils/phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn, error } = useAuth();
  const router = useRouter();
  const pendingReferral = usePendingReferral();
  const copy = strings.access.login;
  const [channel, setChannel] = useState<AccessChannel>("email");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    if (submitting) return;
    // The login contract takes one `identifier`; the channel toggle only decides how to normalize it.
    let identifier: string;
    if (channel === "email") {
      identifier = email.trim().toLowerCase();
      if (!EMAIL.test(identifier)) return setLocalError(copy.invalidEmail);
    } else {
      const normalized = normalizePhone(country, phone);
      if (!normalized) return setLocalError(copy.invalidPhone);
      identifier = normalized;
    }
    if (!password) return setLocalError(copy.missingPassword);
    setLocalError(null);
    setSubmitting(true);
    try {
      // On success the root navigation guard continues to a pending referral or Home.
      await signIn(identifier, password);
    } catch {
      // Surfaced through the auth context's `error` below.
    } finally {
      setSubmitting(false);
    }
  }

  function chooseChannel(next: AccessChannel) {
    setChannel(next);
    setLocalError(null);
  }

  // Before API #50 is deployed, a phone identifier is rejected for lacking `email`: that means "not available yet", not "check your email".
  const phoneNotSupported = channel === "phone" && error?.kind === "validation" && Boolean(error.details?.email);
  const serverError = error
    ? phoneNotSupported
      ? strings.access.errors.notAvailableYet
      : error.kind === "validation"
        ? accessErrorMessage(error)
        : loginErrorMessage(error)
    : null;
  const shownError = localError ?? serverError;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Logo variant="violeta" height={32} />
        </View>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        {pendingReferral ? <Text style={styles.notice}>{copy.referralPending}</Text> : null}
        <View style={styles.form}>
          <ChannelToggle value={channel} onChange={chooseChannel} />
          {channel === "email" ? (
            <TextInput
              label={strings.access.emailLabel}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
            />
          ) : (
            <PhoneField country={country} onCountryChange={setCountry} value={phone} onChangeText={setPhone} />
          )}
          <TextInput
            label={strings.access.passwordLabel}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
          />
          {shownError ? <Text accessibilityRole="alert" style={styles.error}>{shownError}</Text> : null}
          <Button
            label={copy.submit}
            size="lg"
            fullWidth
            onPress={() => void handleSignIn()}
            loading={submitting}
            disabled={!(channel === "email" ? email : phone) || !password}
          />
          <Button label={copy.createAccount} variant="secondary" onPress={() => router.push(routes.register as never)} disabled={submitting} />
          <Button label={copy.haveInvitation} variant="ghost" onPress={() => router.push(routes.invitation as never)} disabled={submitting} />
          <Button label={copy.forgotPassword} variant="ghost" onPress={() => router.push(routes.forgotPassword as never)} disabled={submitting} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: measures.mobileGutter,
    gap: spacing.lg,
  },
  brand: {
    alignItems: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  notice: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
