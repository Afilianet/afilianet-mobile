import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { apiRequest } from "../api/client";
import { friendlyMessage, isApiError } from "../api/errors";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/TextInput";
import { colors, spacing, typography } from "../components/ui/theme";

type Receipt = { id: string; status: string; requested_at: string; completed_at: string | null };

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<{ data: Receipt | null }>("/api/v1/account/deletion-request", { skipOrganization: true })
      .then((result) => { if (active) setReceipt(result.data); })
      .catch(() => { /* Submission remains available if status lookup fails. */ });
    return () => { active = false; };
  }, []);

  async function submit() {
    if (pending || !password || confirmation !== "ELIMINAR") return;
    setPending(true);
    setError("");
    try {
      const result = await apiRequest<{ data: Receipt }>("/api/v1/account/deletion-request", {
        method: "POST", skipOrganization: true, body: { password, confirmation },
      });
      setReceipt(result.data);
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(isApiError(cause) && cause.status === 422 ? "No pudimos verificar tu contraseña. Revisa tus datos." : isApiError(cause) ? friendlyMessage(cause) : "No se pudo enviar la solicitud. Inténtalo de nuevo.");
    } finally { setPending(false); }
  }

  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Eliminar mi cuenta</Text>
    <Text style={styles.body}>La solicitud abarca tu cuenta de Afilianet y tus datos personales en todas tus organizaciones. No elimina las cuentas ni los expedientes de otras personas que hayas ayudado a registrar.</Text>
    {receipt ? <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>Solicitud registrada. Tu cuenta todavía no se ha eliminado. Se revisarán los datos que corresponda borrar y cualquier conservación que deba justificarse.</Text>
      <Text selectable style={styles.body}>Folio: {receipt.id}</Text>
    </> : <>
      <Text style={styles.body}>Confirma tu contraseña y escribe ELIMINAR para solicitar la eliminación de la cuenta y sus datos asociados. Enviar la solicitud no cierra tu sesión ni borra archivos de tu teléfono.</Text>
      <TextInput label="Contraseña actual" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} textContentType="password" />
      <TextInput label="Escribe ELIMINAR" value={confirmation} onChangeText={setConfirmation} maxLength={8} />
      <Button label="Solicitar eliminación" onPress={() => void submit()} loading={pending} disabled={!password || confirmation !== "ELIMINAR"} />
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Button label="Aviso de privacidad" variant="ghost" onPress={() => router.push("/privacy" as never)} />
    <Button label="Volver" variant="secondary" onPress={() => router.back()} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
