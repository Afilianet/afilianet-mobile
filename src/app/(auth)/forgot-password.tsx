import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { apiRequest } from "../../api/client";
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
    setPending(true);
    setError("");
    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST", body: { email: email.trim() },
        skipAuth: true, skipOrganization: true, skipUnauthorizedHandling: true,
      });
      setDone(true);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo en un minuto.");
    } finally { setPending(false); }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Recuperar contraseña</Text>
      {done ? <Text accessibilityLiveRegion="polite" style={styles.body}>Si el correo corresponde a una cuenta, recibirás un enlace para crear una contraseña nueva. Revisa también la carpeta de spam y después vuelve a iniciar sesión en la app.</Text> : <>
        <Text style={styles.body}>Escribe el correo con el que registraste tu cuenta.</Text>
        <TextInput label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Enviar enlace de recuperación" loading={pending} disabled={!email.trim()} onPress={() => void submit()} />
      </>}
      <Button label="Volver al inicio de sesión" variant="ghost" disabled={pending} onPress={() => router.back()} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
