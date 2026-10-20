import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { accessErrorMessage, isSmsUnavailable, requestEmailVerification, requestPhoneVerification, verifyPhone } from "../api/access";
import { isApiError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";
import { pendingReferralPath, usePendingReferral } from "../auth/pendingReferral";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { useCountdown } from "../hooks/useCountdown";
import { strings } from "../i18n";
import { routes } from "../navigation/routes";
import { formatPhoneForDisplay, maskPhone } from "../utils/phone";

const DEFAULT_RESEND_SECONDS = 60;

/**
 * Account-level (never organization-scoped) confirmation of the contact
 * channels the person registered. Verified/pending comes ONLY from the
 * server's user (email_verified_at / phone_verified_at) via refreshUser --
 * a successful code submission is never treated as "verified" by itself.
 */
export default function VerifyAccountScreen() {
  const router = useRouter();
  const { user, refreshUser, consumeOnboardingRoute } = useAuth();
  const pendingReferral = usePendingReferral();
  const copy = strings.access.verify;

  // Reaching this screen completes the post-sign-up step.
  useEffect(() => {
    consumeOnboardingRoute();
  }, [consumeOnboardingRoute]);

  if (!user) return null;
  const emailVerified = Boolean(user.email_verified_at);
  const phoneVerified = Boolean(user.phone_verified_at);
  const allVerified = (!user.email || emailVerified) && (!user.phone || phoneVerified);

  function next() {
    router.replace((pendingReferral ? pendingReferralPath(pendingReferral) : routes.home) as never);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView testID="verify-account-scroll" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading} accessibilityRole="header">{copy.title}</Text>
        <Text style={styles.description}>{copy.description}</Text>
        {user.email ? (
          <EmailChannel key={`email-${user.id}`} email={user.email} verified={emailVerified} refreshUser={refreshUser} />
        ) : null}
        {user.phone ? (
          <PhoneChannel key={`phone-${user.id}`} phone={user.phone} hasEmail={Boolean(user.email)} verified={phoneVerified} refreshUser={refreshUser} />
        ) : null}
        <Button label={allVerified ? copy.continue : copy.later} variant={allVerified ? "primary" : "ghost"} onPress={next} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type RefreshUser = ReturnType<typeof useAuth>["refreshUser"];

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  return mounted;
}

function StatusBadge({ verified }: { verified: boolean }) {
  return <Badge label={verified ? strings.access.verify.verified : strings.access.verify.pending} tone={verified ? "success" : "warning"} />;
}

function EmailChannel({ email, verified, refreshUser }: { email: string; verified: boolean; refreshUser: RefreshUser }) {
  const copy = strings.access.verify;
  const mounted = useMounted();
  const countdown = useCountdown();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy || countdown.active) return;
    setBusy(true);
    setError(null);
    try {
      await requestEmailVerification();
      if (!mounted.current) return;
      setSent(true);
      setMessage(copy.emailSent);
      countdown.start(DEFAULT_RESEND_SECONDS);
    } catch (cause) {
      if (!mounted.current) return;
      setError(accessErrorMessage(cause));
      if (isApiError(cause) && cause.kind === "rate_limited") countdown.start(cause.retryAfterSeconds ?? DEFAULT_RESEND_SECONDS);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const fresh = await refreshUser();
      if (mounted.current && fresh && !fresh.email_verified_at) setMessage(copy.emailStillPending);
    } catch (cause) {
      if (mounted.current) setError(accessErrorMessage(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Card style={styles.card} testID="verify-email">
      <View style={styles.row}>
        <Text style={styles.cardTitle}>{copy.emailTitle}</Text>
        <StatusBadge verified={verified} />
      </View>
      <Text style={styles.description}>{email}</Text>
      {!verified ? (
        <>
          {message ? <Text accessibilityLiveRegion="polite" style={styles.description}>{message}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {countdown.active ? <Text style={styles.meta}>{copy.resendIn(countdown.remaining)}</Text> : null}
          <Button label={sent ? copy.resendEmail : copy.sendEmail} variant="secondary" loading={busy} disabled={countdown.active} onPress={() => void send()} />
          <Button label={copy.checkEmail} variant="ghost" disabled={busy} onPress={() => void check()} />
        </>
      ) : null}
    </Card>
  );
}

function PhoneChannel({ phone, hasEmail, verified, refreshUser }: { phone: string; hasEmail: boolean; verified: boolean; refreshUser: RefreshUser }) {
  const copy = strings.access.verify;
  const mounted = useMounted();
  const countdown = useCountdown();
  const [sent, setSent] = useState(false);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [smsUnavailable, setSmsUnavailable] = useState(false);

  async function send() {
    if (sending || countdown.active) return;
    setSending(true);
    setError(null);
    setSmsUnavailable(false);
    try {
      const delivery = await requestPhoneVerification();
      if (!mounted.current) return;
      setSent(true);
      setCode("");
      setExpiresInMinutes(delivery.expiresInSeconds ? Math.ceil(delivery.expiresInSeconds / 60) : null);
      countdown.start(delivery.retryAfterSeconds);
    } catch (cause) {
      if (!mounted.current) return;
      setError(accessErrorMessage(cause));
      // Rejected before any code exists: never move to "type the code".
      setSmsUnavailable(isSmsUnavailable(cause));
      if (isApiError(cause) && cause.kind === "rate_limited") {
        countdown.start(cause.retryAfterSeconds ?? DEFAULT_RESEND_SECONDS);
        // Registration already sent a code a moment ago (the API allows one per minute): let them type it.
        setSent(true);
      }
      if (isApiError(cause) && cause.reason === "phone_already_verified") await refreshUser().catch(() => null);
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  async function submit() {
    const digits = code.replace(/\D/g, "");
    if (verifying || digits.length < 4) {
      setError(strings.access.errors.otpInvalid);
      return;
    }
    setVerifying(true);
    setError(null);
    setSmsUnavailable(false);
    try {
      await verifyPhone(digits);
      // The server's user is the only proof the phone is verified.
      const fresh = await refreshUser();
      if (!mounted.current) return;
      if (fresh?.phone_verified_at) setNotice(copy.phoneVerified);
    } catch (cause) {
      if (!mounted.current) return;
      setError(accessErrorMessage(cause));
      // On 503 the code is neither consumed nor counted: it stays typed.
      setSmsUnavailable(isSmsUnavailable(cause));
      if (isApiError(cause) && (cause.reason === "otp_expired" || cause.reason === "otp_attempts_exceeded")) {
        // The code is dead: let them request a fresh one right away.
        setCode("");
        setSent(false);
      }
    } finally {
      if (mounted.current) setVerifying(false);
    }
  }

  return (
    <Card style={styles.card} testID="verify-phone">
      <View style={styles.row}>
        <Text style={styles.cardTitle}>{copy.phoneTitle}</Text>
        <StatusBadge verified={verified} />
      </View>
      <Text style={styles.description}>{formatPhoneForDisplay(phone)}</Text>
      {verified ? (
        notice ? <Text accessibilityLiveRegion="polite" style={styles.description}>{notice}</Text> : null
      ) : (
        <>
          {sent ? <Text accessibilityLiveRegion="polite" style={styles.description}>{copy.codeSentTo(maskPhone(phone))}</Text> : null}
          {sent && expiresInMinutes ? <Text style={styles.meta}>{copy.codeExpiresIn(expiresInMinutes)}</Text> : null}
          {sent ? (
            <>
              <TextInput
                label={copy.codeLabel}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={8}
                helperText={copy.codeHint}
              />
              <Button label={copy.submitCode} loading={verifying} disabled={!code.trim()} onPress={() => void submit()} />
            </>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {smsUnavailable && hasEmail ? <Text style={styles.description}>{copy.smsUnavailableWithEmail}</Text> : null}
          {countdown.active ? <Text style={styles.meta}>{copy.resendIn(countdown.remaining)}</Text> : null}
          <Button
            label={sent ? copy.resendCode : copy.sendCode}
            variant={sent ? "ghost" : "secondary"}
            loading={sending}
            disabled={countdown.active}
            onPress={() => void send()}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.caption, color: colors.danger },
});
