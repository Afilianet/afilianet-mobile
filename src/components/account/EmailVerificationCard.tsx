import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";
import { apiRequest } from "../../api/client";
import { fetchMe } from "../../api/endpoints";
import { friendlyMessage, isApiError } from "../../api/errors";
import type { User } from "../../types/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";

export function EmailVerificationCard({ user }: { user: User }) {
  const account = useQuery({ queryKey: ["account-email", user.id], queryFn: fetchMe, enabled: Boolean(user.email), retry: false });
  const { refetch } = account;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const current = account.data ?? user;
  const verified = Boolean(current.email_verified_at);

  useFocusEffect(useCallback(() => { if (user.email) void refetch(); }, [refetch, user.email]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && user.email) void refetch();
    });
    return () => subscription.remove();
  }, [refetch, user.email]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (pending || cooldown > 0) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/auth/email-verification", { method: "POST", skipOrganization: true });
      setMessage("Solicitud recibida. Revisa tu correo y la carpeta de spam. El enlace dura 60 minutos.");
      setCooldown(60);
    } catch (cause) {
      setError(isApiError(cause) ? friendlyMessage(cause) : "No se pudo solicitar el correo. Inténtalo de nuevo.");
      if (isApiError(cause) && cause.kind === "rate_limited") setCooldown(60);
    } finally { setPending(false); }
  }

  if (!current.email) return null;
  return <Card style={styles.card}>
    <Text style={styles.title}>Correo electrónico</Text>
    <Badge label={verified ? "Correo confirmado" : "Pendiente de confirmar"} tone={verified ? "success" : "warning"} />
    {!verified && <>
      <Text style={styles.body}>Confirma {current.email} desde el enlace que te enviamos.</Text>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
      <Button label={cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar correo de verificación"} loading={pending} disabled={cooldown > 0} onPress={() => void resend()} />
      <Button label="Ya confirmé mi correo" variant="ghost" loading={account.isFetching} onPress={() => void refetch()} />
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {account.isError ? <Text accessibilityRole="alert" style={styles.error}>No se pudo actualizar el estado del correo. Inténtalo de nuevo.</Text> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
