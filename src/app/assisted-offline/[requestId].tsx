import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useDocumentCamera } from "../../hooks/useDocumentCamera";
import { listPendingAssisted, removePendingAssisted, replaceAssistedPhoto } from "../../services/assistedQueue";
import { removeAssistedPhoto, sealAssistedPhoto, type AssistedPhoto } from "../../services/assistedEvidenceVault";
import { useOrganization } from "../../state/OrganizationContext";
import { resolveMimeType, validateCapturedAsset } from "../../utils/documentCapture";

export default function AssistedOfflineScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const router = useRouter();
  const camera = useDocumentCamera();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useApiQuery(
    ["assisted-local", user?.id, activeOrganization?.id, requestId],
    async () => (await listPendingAssisted(user!.id, activeOrganization!.id))
      .find((item) => item.input.client_request_id === requestId) ?? null,
    { enabled: Boolean(user) && Boolean(activeOrganization) },
  );

  async function capture(type: AssistedPhoto["evidenceType"]) {
    if (!user || !activeOrganization || !query.data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await camera.capture();
      if (result.status === "cancelled") return;
      if (result.status !== "captured") throw new Error("No se pudo abrir la cámara. Revisa el permiso de cámara del teléfono.");
      const file = new File(result.uri);
      const check = validateCapturedAsset({ ...result, fileSize: file.size });
      if (!check.valid) throw new Error(check.error);
      const mimeType = resolveMimeType(result.mimeType);
      if (!mimeType) throw new Error("El formato de esta foto no es compatible.");
      const photo = await sealAssistedPhoto(type, mimeType, result.uri);
      try {
        await replaceAssistedPhoto(user.id, activeOrganization.id, requestId, photo);
      } catch (cause) {
        await removeAssistedPhoto(photo);
        throw cause;
      }
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la foto. Inténtalo de nuevo.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function discard() {
    Alert.alert("Eliminar copia local", "Se eliminarán los datos y fotos guardados en este teléfono. Si el afiliado ya se creó al sincronizar, su registro en la organización se conserva.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => {
        void removePendingAssisted(requestId).then(() => router.back()).catch(() => setError("No se pudo eliminar la copia local."));
      } },
    ]);
  }

  if (query.isPending) return <LoadingState message="Abriendo registro guardado…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const item = query.data;
  if (!item) return <Card><Text>Este registro ya se sincronizó o no pertenece a esta sesión.</Text><Button label="Volver" onPress={() => router.back()} /></Card>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.heading}>INE guardada sin conexión</Text>
    <Text style={styles.description}>{item.input.first_name} {item.input.last_name}</Text>
    <Text style={styles.description}>Fotografía la INE completa, con luz y sin reflejos. Las fotos quedan cifradas en este teléfono; su calidad se validará al enviarlas.</Text>
    {(["id_document_front", "id_document_back"] as const).map((type) => {
      const saved = item.photos?.some((photo) => photo.evidenceType === type);
      const label = type === "id_document_front" ? "Frente de INE" : "Reverso de INE";
      return <Card key={type} style={styles.card}>
        <Text style={styles.label}>{label} · {saved ? "Guardado en el teléfono" : "Pendiente"}</Text>
        <Button label={saved ? `Volver a tomar: ${label}` : `Capturar: ${label}`} loading={busy} onPress={() => void capture(type)} />
      </Card>;
    })}
    <Text style={styles.description}>La prueba de vida requiere conexión. Al volver la red, sincroniza desde Red y continúa la verificación en este teléfono.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Button label="Guardar y volver a Red" disabled={busy} onPress={() => router.back()} />
    <Button label="Eliminar copia local" variant="danger" disabled={busy} onPress={discard} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  card: { gap: spacing.sm },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  error: { ...typography.body, color: colors.danger },
});
