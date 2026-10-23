import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  accessErrorMessage,
  isSmsUnavailable,
  requestEmailVerification,
  requestPhoneVerification,
  unavailablePhoneChannel,
  verifyPhone,
  type PhoneCodeChannel,
} from "../api/access";
import { isApiError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";
import { pendingReferralPath, usePendingReferral } from "../auth/pendingReferral";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/TextInput";
import { colors, measures, radius, spacing, typography } from "../components/ui/theme";
import { whatsappCodeChannelEnabled } from "../config/phoneChannels";
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
          <PhoneChannel key={`phone-${user.id}-${user.phone}`} phone={user.phone} hasEmail={Boolean(user.email)} verified={phoneVerified} refreshUser={refreshUser} />
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

type ChannelFlags = Record<PhoneCodeChannel, boolean>;
// Only channels the server really offers: WhatsApp needs an explicit build switch (see config/phoneChannels).
const CHANNELS: PhoneCodeChannel[] = whatsappCodeChannelEnabled ? ["sms", "whatsapp"] : ["sms"];
const SEVERAL_CHANNELS = CHANNELS.length > 1;
const otherChannel = (channel: PhoneCodeChannel): PhoneCodeChannel => (channel === "sms" ? "whatsapp" : "sms");

/**
 * Phone code by SMS or WhatsApp (API #79). The person picks the channel; the
 * app never switches it on its own. One wait (the API's retry_after) applies
 * to both channels, and only the newest code is valid. Verified is shown only
 * once the server's user has phone_verified_at.
 */
function PhoneChannel({ phone, hasEmail, verified, refreshUser }: { phone: string; hasEmail: boolean; verified: boolean; refreshUser: RefreshUser }) {
  const copy = strings.access.verify;
  const mounted = useMounted();
  const countdown = useCountdown();
  const [channel, setChannel] = useState<PhoneCodeChannel>("sms");
  // Channel the API says it queued the latest code on; null until one is accepted.
  const [sentChannel, setSentChannel] = useState<PhoneCodeChannel | null>(null);
  const [codeStep, setCodeStep] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const [smsOnlyServer, setSmsOnlyServer] = useState(false);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acceptedNotConfirmed, setAcceptedNotConfirmed] = useState(false);
  // Channels a 503 said cannot send right now, and the one behind the last error.
  const [unavailable, setUnavailable] = useState<ChannelFlags>({ sms: false, whatsapp: false });
  const [downChannel, setDownChannel] = useState<PhoneCodeChannel | null>(null);
  const busy = sending || verifying;
  const name = (value: PhoneCodeChannel) => copy.channelNames[value];

  async function send() {
    if (busy || countdown.active) return;
    const requested = channel;
    setSending(true);
    setError(null);
    setDownChannel(null);
    setAcceptedNotConfirmed(false);
    try {
      const delivery = await requestPhoneVerification(requested);
      if (!mounted.current) return;
      setSentChannel(delivery.channel);
      setChannel(delivery.channel);
      setSmsOnlyServer(requested !== delivery.channel);
      setUnavailable((flags) => ({ ...flags, [delivery.channel]: false }));
      setSendCount((count) => count + 1);
      setCodeStep(true);
      setCode("");
      setExpiresInMinutes(delivery.expiresInSeconds ? Math.ceil(delivery.expiresInSeconds / 60) : null);
      countdown.start(delivery.retryAfterSeconds);
    } catch (cause) {
      if (!mounted.current) return;
      setError(sendErrorMessage(cause));
      // Rejected before any code exists (503, or a channel the API refuses): stay before "type the code".
      const down = unavailablePhoneChannel(cause) ?? (isChannelRejected(cause) ? requested : null);
      if (down) {
        // An API without #79 ignores `channel`: SMS being down for a WhatsApp request means neither works.
        const bothDown = down !== requested;
        setUnavailable((flags) => (bothDown ? { sms: true, whatsapp: true } : { ...flags, [down]: true }));
        setDownChannel(requested);
      }
      if (isApiError(cause) && cause.kind === "rate_limited") {
        // Only the API's own wait; none is made up when it gives none.
        if (cause.retryAfterSeconds) countdown.start(cause.retryAfterSeconds);
        // A code from a moment ago (e.g. sent at sign-up) may still be valid -- unless the last try created none.
        if (sentChannel || !Object.values(unavailable).some(Boolean)) setCodeStep(true);
      }
      if (isApiError(cause) && cause.reason === "phone_already_verified") await refreshUser().catch(() => null);
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  async function confirmWithServer() {
    // The server's user is the only proof the phone is verified.
    const fresh = await refreshUser();
    if (!mounted.current) return;
    if (fresh?.phone_verified_at) {
      setAcceptedNotConfirmed(false);
      setNotice(copy.phoneVerified);
    } else {
      setAcceptedNotConfirmed(true);
    }
  }

  async function submit() {
    if (busy) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) {
      setError(strings.access.errors.otpInvalid);
      return;
    }
    setVerifying(true);
    setError(null);
    setDownChannel(null);
    let accepted = false;
    try {
      await verifyPhone(digits);
      accepted = true;
      if (!mounted.current) return;
      await confirmWithServer();
    } catch (cause) {
      if (!mounted.current) return;
      if (accepted) {
        // The code went through but the account could not be re-read: still not shown as verified.
        setAcceptedNotConfirmed(true);
        setError(accessErrorMessage(cause));
        return;
      }
      // On 503 the code is neither consumed nor counted: it stays typed.
      setError(isSmsUnavailable(cause) ? copy.verifyUnavailable : accessErrorMessage(cause));
      if (isApiError(cause) && (cause.reason === "otp_expired" || cause.reason === "otp_attempts_exceeded")) {
        // The code is dead: let them request a fresh one (on either channel) once the wait allows.
        setCode("");
        setCodeStep(false);
        setSentChannel(null);
      }
    } finally {
      if (mounted.current) setVerifying(false);
    }
  }

  async function recheck() {
    if (busy) return;
    setVerifying(true);
    setError(null);
    try {
      await confirmWithServer();
    } catch (cause) {
      if (mounted.current) setError(accessErrorMessage(cause));
    } finally {
      if (mounted.current) setVerifying(false);
    }
  }

  const bothDown = unavailable.sms && unavailable.whatsapp;

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
          {sentChannel ? <Text accessibilityLiveRegion="polite" style={styles.description}>{copy.codeSentTo(name(sentChannel), maskPhone(phone))}</Text> : null}
          {sentChannel && smsOnlyServer ? <Text style={styles.description}>{copy.smsOnlyServer}</Text> : null}
          {sentChannel && sendCount > 1 ? <Text style={styles.meta}>{copy.newestCodeOnly}</Text> : null}
          {sentChannel && expiresInMinutes ? <Text style={styles.meta}>{copy.codeExpiresIn(expiresInMinutes)}</Text> : null}
          {codeStep ? (
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
              <Button label={copy.submitCode} loading={verifying} disabled={!code.trim() || sending} onPress={() => void submit()} />
            </>
          ) : null}
          {acceptedNotConfirmed ? (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.description}>{copy.acceptedNotConfirmed}</Text>
              <Button label={copy.checkStatus} variant="secondary" disabled={busy} onPress={() => void recheck()} />
            </>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {downChannel && SEVERAL_CHANNELS ? (
            <Text style={styles.description}>{bothDown ? copy.noChannelAvailable : copy.tryOtherChannel(name(otherChannel(downChannel)))}</Text>
          ) : null}
          {downChannel && hasEmail ? <Text style={styles.description}>{copy.smsUnavailableWithEmail}</Text> : null}
          {SEVERAL_CHANNELS ? (
            <>
            <Text style={styles.label}>{copy.channelQuestion}</Text>
            <View style={styles.channels} accessibilityRole="radiogroup">
              {CHANNELS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setChannel(option)}
                  disabled={busy}
                  style={[styles.channel, channel === option ? styles.channelSelected : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: channel === option, disabled: busy }}
                  accessibilityLabel={copy.channelOption(name(option))}
                >
                  <Text style={[styles.channelLabel, channel === option ? styles.channelLabelSelected : null]}>{name(option)}</Text>
                </Pressable>
              ))}
            </View>
            </>
          ) : null}
          {countdown.active ? (
            <>
              <Text style={styles.meta}>{copy.resendIn(countdown.remaining)}</Text>
              {SEVERAL_CHANNELS ? <Text style={styles.meta}>{copy.sharedWait}</Text> : null}
            </>
          ) : null}
          <Button
            label={sentChannel ? copy.resendCodeBy(name(channel)) : copy.sendCodeBy(name(channel))}
            variant={codeStep ? "ghost" : "secondary"}
            loading={sending}
            disabled={countdown.active || verifying}
            onPress={() => void send()}
          />
        </>
      )}
    </Card>
  );
}

/** Sending is limited once a minute for SMS and WhatsApp together: say so (when both are offered), with the API's own wait. */
function sendErrorMessage(error: unknown): string {
  if (SEVERAL_CHANNELS && isApiError(error) && error.kind === "rate_limited" && error.retryAfterSeconds) return strings.access.verify.rateLimited(error.retryAfterSeconds);
  return accessErrorMessage(error);
}

function isChannelRejected(error: unknown): boolean {
  return isApiError(error) && error.kind === "validation" && Boolean(error.details?.channel);
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
  label: { ...typography.label, color: colors.textTertiary },
  channels: { flexDirection: "row", gap: spacing.sm },
  channel: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  channelLabel: { ...typography.body, color: colors.textSecondary },
  channelLabelSelected: { ...typography.bodyStrong, color: colors.textPrimary },
});
