import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { friendlyMessage, isApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, spacing, typography } from "../../components/ui/theme";

export default function LoginScreen() {
  const { signIn, signInWithToken, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [devToken, setDevToken] = useState("");
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  async function handleSignIn() {
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      // error is surfaced via the auth context's `error` state below.
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDevTokenSignIn() {
    setDevSubmitting(true);
    setDevError(null);
    try {
      await signInWithToken(devToken.trim());
    } catch (err) {
      setDevError(isApiError(err) ? friendlyMessage(err) : "Couldn't sign in with that token.");
    } finally {
      setDevSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Afilianet</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
          />
          {error ? <Text style={styles.error}>{friendlyMessage(error)}</Text> : null}
          <Button label="Sign in" onPress={handleSignIn} loading={submitting} disabled={!email || !password} />
        </View>

        {__DEV__ ? (
          <View style={styles.devSection}>
            <Text style={styles.devTitle}>Dev-only: sign in with a token</Text>
            <Text style={styles.devDescription}>
              afilianet-api doesn&apos;t have a login endpoint yet. Paste a Sanctum token here (get one with{" "}
              <Text style={styles.mono}>php artisan tinker</Text> → <Text style={styles.mono}>$user-&gt;createToken(&apos;dev&apos;)-&gt;plainTextToken</Text>) to
              exercise the rest of the app.
            </Text>
            <TextInput
              label="Access token"
              value={devToken}
              onChangeText={setDevToken}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="1|abcdef..."
            />
            {devError ? <Text style={styles.error}>{devError}</Text> : null}
            <Button
              label="Sign in with token"
              variant="secondary"
              onPress={handleDevTokenSignIn}
              loading={devSubmitting}
              disabled={!devToken}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: -spacing.md,
  },
  form: {
    gap: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  devSection: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  devTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  devDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});
