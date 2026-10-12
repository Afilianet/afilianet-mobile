import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../api/errors";
import { apiRequest } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";

export default function ForgotPasswordScreen() {
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
      await apiRequest("/api/v1/auth/forgot-password", {
        method: "POST", body: { email: normalizedEmail },
        skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true,
      });
      setDone(true);
    } catch (cause) {
      setError(isApiError(cause) ? friendlyMessage(cause) : "No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally { setPending(false); }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Recuperar contraseña</Text>
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
    </ScrollView>
  </KeyboardAvoidingView>;
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
  error: { ...typography.body, color: colors.danger },
});

