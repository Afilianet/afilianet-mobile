import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiRequest } from "../api/client";
import { friendlyMessage, isApiError } from "../api/errors";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/TextInput";
import { colors, spacing, typography } from "../components/ui/theme";
import { useOrganization } from "../state/OrganizationContext";

export default function LeaveOrganizationScreen() {
  const router = useRouter();
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  const { organizations, refresh } = useOrganization();
  const organization = organizations.find(org => org.id === organizationId);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (pending || done || !organization || !password || confirmation !== "SALIR") return;
    setPending(true); setError("");
    try {
      await apiRequest(`/api/v1/me/organizations/${organization.id}/leave`, {
        method: "POST", skipOrganization: true, body: { password, confirmation },
      });
      setDone(true); setPassword(""); setConfirmation("");
      await refresh(organization.id);
    } catch (cause) {
      setError(isApiError(cause) ? friendlyMessage(cause) : "No se pudo actualizar la información. Revisa tu conexión y vuelve a intentarlo.");
    } finally { setPending(false); }
  }
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Salir de una organización</Text>
    {done ? <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>Ya saliste de esta organización. Tu cuenta y las demás afiliaciones siguen activas.</Text>
      <Button label="Ir a mi perfil" onPress={() => router.replace("/(app)/profile" as never)} />
    </> : organization ? <>
      <Text style={styles.title}>{organization.name}</Text>
      <Text style={styles.body}>Dejarás de tener acceso a esta organización y de recibir sus notificaciones. Tu cuenta de Afilianet y tus afiliaciones a otras organizaciones se conservan.</Text>
      <Text style={styles.body}>Tus afiliados directos se conectarán con el patrocinador superior activo más cercano de esta organización. Si no existe, quedarán sin patrocinador.</Text>
      <Text style={styles.body}>Esta baja no borra tus registros históricos ni equivale a eliminar tu cuenta. No se puede deshacer desde la app. Si eres propietario, primero debes transferir la propiedad y cambiar tu rol.</Text>
      <TextInput label="Contraseña actual" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} textContentType="password" editable={!pending} />
      <TextInput label="Escribe SALIR" value={confirmation} onChangeText={setConfirmation} maxLength={5} editable={!pending} />
      <Button label="Confirmar salida" loading={pending} disabled={!password || confirmation !== "SALIR"} onPress={() => void submit()} />
    </> : <Text style={styles.body}>Selecciona una organización desde tu perfil para solicitar la baja.</Text>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!done ? <Button label="Volver" variant="secondary" disabled={pending} onPress={() => router.back()} /> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
