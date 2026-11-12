import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { accessErrorMessage, changePhone, isSmsUnavailable, verifyPhone } from "../../api/access";
import { isApiError } from "../../api/errors";
import type { useAuth } from "../../auth/AuthContext";
import { useCountdown } from "../../hooks/useCountdown";
import { strings } from "../../i18n";
import type { User } from "../../types/api";
import { DEFAULT_PHONE_COUNTRY, formatPhoneForDisplay, maskPhone, normalizePhone } from "../../utils/phone";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TextInput } from "../ui/TextInput";
import { colors, spacing, typography } from "../ui/theme";
import { PhoneField } from "./PhoneField";

type RefreshUser = ReturnType<typeof useAuth>["refreshUser"];
const RESEND_SECONDS = 60;

/**
 * Add a phone to an email-only account, or change it (PATCH /me/phone,
 * ACCOUNT_ACCESS_CONTRACT §5). The number becomes `pending_phone` and gets an
 * SMS code; the same POST /auth/verify-phone confirms it and the server swaps
 * it in. The current phone keeps working until then. Verified is shown only
 * from the server's user (phone_verified_at), never from a submitted code.
 * Sending again to the pending number is PATCH /me/phone with that number.
 */
export function PhoneChangeCard({ user, refreshUser }: { user: User; refreshUser: RefreshUser }) {
  const copy = strings.access.verify;
  const countdown = useCountdown();
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  const pending = user.pending_phone ?? null;
  const [editing, setEditing] = useState(false);
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function request(target: string) {
    if (busy || countdown.active) return;
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    setNotice(null);
    try {
      await changePhone(target);
      if (!mounted.current) return;
      await refreshUser().catch(() => null);
      if (!mounted.current) return;
      setEditing(false);
      setPhone("");
      setCode("");
      setNotice(copy.codeSentTo(copy.channelNames.sms, maskPhone(target)));
      countdown.start(RESEND_SECONDS);
    } catch (cause) {
      if (!mounted.current) return;
      if (isApiError(cause) && cause.kind === "rate_limited") countdown.start(cause.retryAfterSeconds ?? RESEND_SECONDS);
      const field = isApiError(cause) ? cause.details?.phone : undefined;
      if (field) {
        // The API's own Spanish, on the field: invalid, or already used by another account.
        setFieldError(Array.isArray(field) ? String(field[0]) : String(field));
      } else {
        setError(isSmsUnavailable(cause) ? copy.smsUnavailableNothingSaved : accessErrorMessage(cause));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function submitNumber() {
    const normalized = normalizePhone(country, phone);
    if (!normalized) {
      setFieldError(strings.access.login.invalidPhone);
      return;
    }
    void request(normalized);
  }

  async function confirm() {
    if (busy) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) {
      setError(strings.access.errors.otpInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyPhone(digits);
      if (!mounted.current) return;
      const fresh = await refreshUser().catch(() => null);
      if (!mounted.current) return;
      if (fresh && !fresh.pending_phone && fresh.phone_verified_at) {
        setNotice(copy.phoneVerified);
        setCode("");
      } else {
        setError(copy.acceptedNotConfirmed);
      }
    } catch (cause) {
      if (!mounted.current) return;
      setError(isSmsUnavailable(cause) ? copy.verifyUnavailable : accessErrorMessage(cause));
      if (isApiError(cause) && (cause.reason === "otp_expired" || cause.reason === "otp_attempts_exceeded")) setCode("");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Card style={styles.card} testID="phone-change">
      {pending && !editing ? (
        <>
          <View style={styles.row}>
            <Text style={styles.title}>{copy.pendingPhoneTitle}</Text>
            <Badge label={copy.pending} tone="warning" />
          </View>
          <Text style={styles.body}>{formatPhoneForDisplay(pending)}</Text>
          <Text style={styles.body}>{user.phone ? copy.pendingPhoneNote : copy.pendingPhoneNoteFirst}</Text>
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text> : null}
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
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label={copy.submitCode} loading={busy} disabled={!code.trim()} onPress={() => void confirm()} />
          {countdown.active ? <Text style={styles.meta}>{copy.resendIn(countdown.remaining)}</Text> : null}
          <Button label={copy.resendToNewPhone} variant="ghost" disabled={busy || countdown.active} onPress={() => void request(pending)} />
          <Button label={copy.useOtherNumber} variant="ghost" disabled={busy} onPress={() => { setEditing(true); setError(null); setNotice(null); }} />
        </>
      ) : editing ? (
        <>
          <Text style={styles.title}>{copy.newPhoneTitle}</Text>
          <Text style={styles.body}>{copy.newPhoneHint}</Text>
          <PhoneField country={country} onCountryChange={setCountry} value={phone} onChangeText={setPhone} error={fieldError} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {countdown.active ? <Text style={styles.meta}>{copy.resendIn(countdown.remaining)}</Text> : null}
          <Button label={copy.sendToNewPhone} loading={busy} disabled={!phone.trim() || countdown.active} onPress={submitNumber} />
          <Button label={copy.cancelChange} variant="ghost" disabled={busy} onPress={() => { setEditing(false); setError(null); setFieldError(undefined); }} />
        </>
      ) : (
        <>
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text> : null}
          <Button label={user.phone ? copy.changePhone : copy.addPhone} variant="secondary" onPress={() => { setEditing(true); setNotice(null); }} testID="phone-change-start" />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.caption, color: colors.danger },
});
