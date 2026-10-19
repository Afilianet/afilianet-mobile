import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage, isSmsUnavailable, requestPasswordRecovery, resetPasswordWithPhoneCode } from "../../api/access";
import { friendlyMessage, isApiError } from "../../api/errors";
import { ChannelToggle, type AccessChannel } from "../../components/account/ChannelToggle";
import { PhoneField } from "../../components/account/PhoneField";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { useCountdown } from "../../hooks/useCountdown";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { DEFAULT_PHONE_COUNTRY, maskPhone, normalizePhone } from "../../utils/phone";

/**
 * Recovery through whichever channel the account has: an emailed link
 * (existing API) or an SMS code plus the new password (proposed API), so a
 * phone-only account can recover too. Both requests answer generically, so
 * this screen never reveals whether an account exists.
 */
export default function ForgotPasswordScreen() {
  const [channel, setChannel] = useState<AccessChannel>("email");
  const copy = strings.access.recovery;

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{copy.title}</Text>
      <Text style={styles.body}>{copy.description}</Text>
      <ChannelToggle value={channel} onChange={setChannel} />
      {channel === "email" ? <EmailRecovery /> : <PhoneRecovery onUseEmail={() => setChannel("email")} />}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function EmailRecovery() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (pending) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      setError("Escribe un correo electrónico válido.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await requestPasswordRecovery({ email: normalizedEmail });
      setDone(true);
    } catch (cause) {
      setError(isApiError(cause) ? friendlyMessage(cause) : "No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally { setPending(false); }
  }

  return <>
    {done ? <Card style={styles.confirmation}>
      <View style={styles.mailBadge}><Text style={styles.mailSymbol}>@</Text></View>
      <Text accessibilityLiveRegion="polite" style={styles.confirmationTitle}>Revisa tu correo</Text>
      <Text style={styles.body}>Si el correo corresponde a una cuenta, recibirás un enlace para crear una contraseña nueva.</Text>
      <Text style={styles.body}>Revisa también la carpeta de spam. Después de cambiar tu contraseña, vuelve a iniciar sesión en Afilianet.</Text>
    </Card> : <>
      <Text style={styles.body}>Escribe el correo con el que registraste tu cuenta.</Text>
      <TextInput label="Correo electrónico" value={email} onChangeText={setEmail} editable={!pending} maxLength={254} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label="Enviar enlace de recuperación" loading={pending} disabled={!email.trim()} onPress={() => void submit()} />
    </>}
    <Button label="Volver al inicio de sesión" variant={done ? "primary" : "ghost"} disabled={pending} onPress={() => router.back()} />
  </>;
}

function PhoneRecovery({ onUseEmail }: { onUseEmail: () => void }) {
  const router = useRouter();
  const copy = strings.access.recovery;
  const countdown = useCountdown();
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsUnavailable, setSmsUnavailable] = useState(false);

  async function sendCode(target = sentTo ?? normalizePhone(country, phone)) {
    if (pending || countdown.active) return;
    if (!target) {
      setError(strings.access.login.invalidPhone);
      return;
    }
    setPending(true);
    setError(null);
    setSmsUnavailable(false);
    try {
      // `delivery: "queued"` only means accepted: the copy never claims it arrived.
      const delivery = await requestPasswordRecovery({ phone: target });
      setSentTo(target);
      setCode("");
      countdown.start(delivery.retryAfterSeconds);
    } catch (cause) {
      // Rejected (e.g. 503 sms_unavailable): stay on this step with the number kept.
      setError(accessErrorMessage(cause));
      setSmsUnavailable(isSmsUnavailable(cause));
      if (isApiError(cause) && cause.kind === "rate_limited") countdown.start(cause.retryAfterSeconds ?? 60);
    } finally { setPending(false); }
  }

  async function reset() {
    if (pending || !sentTo) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) return setError(strings.access.errors.otpInvalid);
    if (password.length < 8) return setError(strings.access.register.passwordTooShort);
    if (password !== confirmation) return setError(strings.access.register.passwordMismatch);
    setPending(true);
    setError(null);
    setSmsUnavailable(false);
    try {
      await resetPasswordWithPhoneCode({ phone: sentTo, code: digits, password, password_confirmation: confirmation });
      setDone(true);
    } catch (cause) {
      // On 503 the password and code are untouched server-side; keep them typed.
      setError(accessErrorMessage(cause));
      setSmsUnavailable(isSmsUnavailable(cause));
      if (isApiError(cause) && (cause.reason === "otp_expired" || cause.reason === "otp_attempts_exceeded")) setCode("");
    } finally { setPending(false); }
  }

  if (done) {
    return <Card style={styles.confirmation}>
      <Text accessibilityLiveRegion="polite" style={styles.confirmationTitle}>{copy.done}</Text>
      <Button label={copy.backToLogin} onPress={() => router.replace(routes.login as never)} />
    </Card>;
  }

  return <>
    {sentTo ? <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>{copy.codeStepDescription(maskPhone(sentTo))}</Text>
      <TextInput label={strings.access.verify.codeLabel} value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={8} helperText={strings.access.verify.codeHint} />
      <TextInput label={copy.newPasswordLabel} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
      <TextInput label={strings.access.confirmPasswordLabel} value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {smsUnavailable ? <>
        <Text style={styles.body}>{copy.smsUnavailableEmailHint}</Text>
        <Button label={copy.useEmail} variant="secondary" disabled={pending} onPress={onUseEmail} />
      </> : null}
      <Button label={copy.submit} loading={pending} disabled={!code.trim() || !password} onPress={() => void reset()} />
      {countdown.active ? <Text style={styles.meta}>{strings.access.verify.resendIn(countdown.remaining)}</Text> : null}
      <Button label={strings.access.verify.resendCode} variant="ghost" disabled={countdown.active || pending} onPress={() => void sendCode(sentTo)} />
      <Button label={copy.useOtherNumber} variant="ghost" disabled={pending} onPress={() => { setSentTo(null); setCode(""); setError(null); }} />
    </> : <>
      <PhoneField country={country} onCountryChange={setCountry} value={phone} onChangeText={setPhone} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {smsUnavailable ? <>
        <Text style={styles.body}>{copy.smsUnavailableEmailHint}</Text>
        <Button label={copy.useEmail} variant="secondary" disabled={pending} onPress={onUseEmail} />
      </> : null}
      {countdown.active ? <Text style={styles.meta}>{strings.access.verify.resendIn(countdown.remaining)}</Text> : null}
      <Button label={copy.sendCode} loading={pending} disabled={!phone.trim() || countdown.active} onPress={() => void sendCode()} />
    </>}
    <Button label={copy.backToLogin} variant="ghost" disabled={pending} onPress={() => router.back()} />
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: measures.mobileGutter, gap: spacing.md },
  confirmation: { gap: spacing.md, padding: spacing.lg },
  confirmationTitle: { ...typography.subtitle, color: colors.textPrimary },
  mailBadge: { alignSelf: "flex-start", borderRadius: 28, padding: spacing.md, backgroundColor: colors.surfaceRaised },
  mailSymbol: { ...typography.title, color: colors.textPrimary },
  heading: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.body, color: colors.danger },
});
