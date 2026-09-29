import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchPublicReferral, startReferralInvitation, type PublicReferral } from "../../../api/endpoints";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useAuth } from "../../../auth/AuthContext";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../../components/ui/theme";
import { Logo } from "../../../design-system/icons/Logo";
import { strings } from "../../../i18n";
import { routes } from "../../../navigation/routes";

export default function JoinScreen() {
  const { organizationId, code } = useLocalSearchParams<{ organizationId: string; code: string }>();
  const router = useRouter();
  const { registerFromReferral } = useAuth();
  const [referral, setReferral] = useState<PublicReferral | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const invitationToken = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReferral(null);
    setLookupError(null);
    invitationToken.current = null;
    if (!organizationId || !code) {
      setLookupError(strings.auth.join.invalidLink);
      setLoading(false);
      return;
    }
    void fetchPublicReferral(organizationId, code)
      .then((value) => {
        if (active) setReferral(value);
      })
      .catch((error) => {
        if (active)
          setLookupError(
            isApiError(error) && error.kind === "not_found"
              ? strings.auth.join.invalidLink
              : isApiError(error)
                ? friendlyMessage(error)
                : strings.shared.genericError,
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, code]);

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!firstName.trim() || !lastName.trim() || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || password.length < 8) {
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
      if (!invitationToken.current) {
        invitationToken.current = (await startReferralInvitation(organizationId, code)).token;
      }
      if (!invitationToken.current) throw new Error("Missing invitation token");
      await registerFromReferral(invitationToken.current, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: normalizedEmail,
        password,
      });
    } catch (error) {
      setSubmitError(
        isApiError(error)
          ? error.kind === "validation"
            ? error.message.startsWith("Ya existe")
              ? strings.auth.join.alreadyRegistered
              : strings.auth.join.checkFields
            : friendlyMessage(error)
          : strings.shared.genericError,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Logo variant="violeta" height={32} />
        </View>
        <Text style={styles.title}>{strings.auth.join.title}</Text>
        {loading ? <Text style={styles.info}>{strings.shared.loading}</Text> : null}
        {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
        {referral ? (
          <View style={styles.form}>
            <Text style={styles.info}>{strings.auth.join.invitedBy(referral.referrer_first_name)}</Text>
            <TextInput
              label={strings.auth.join.firstName}
              value={firstName}
              onChangeText={setFirstName}
              textContentType="givenName"
            />
            <TextInput
              label={strings.auth.join.lastName}
              value={lastName}
              onChangeText={setLastName}
              textContentType="familyName"
            />
            <TextInput
              label={strings.auth.login.emailLabel}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
            />
            <TextInput
              label={strings.auth.login.passwordLabel}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
            />
            <TextInput
              label={strings.auth.join.confirmPassword}
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              textContentType="newPassword"
            />
            {submitError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {submitError}
              </Text>
            ) : null}
            <Button
              label={strings.auth.join.submit}
              size="lg"
              fullWidth
              loading={submitting}
              onPress={() => void submit()}
            />
          </View>
        ) : null}
        <Button label={strings.auth.join.signIn} variant="ghost" onPress={() => router.push(routes.login as never)} />
      </ScrollView>
    </KeyboardAvoidingView>
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
