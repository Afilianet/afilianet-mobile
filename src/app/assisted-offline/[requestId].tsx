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
import { listPendingAssisted, removePendingAssisted, replaceAssistedPhoto, replaceAssistedGeolocation } from "../../services/assistedQueue";
import { removeAssistedPhoto, sealAssistedPhoto, type AssistedPhoto } from "../../services/assistedEvidenceVault";
import { useOrganization } from "../../state/OrganizationContext";
import { resolveMimeType, validateCapturedAsset } from "../../utils/documentCapture";

import { captureDeviceGeolocation, buildGeolocationSubmission } from "../../utils/geolocation";

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
    { enabled: Boolean(user) && Boolean(activeOrganization), networkMode: "always" },
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

  async function captureLocation() {
    if (!user || !activeOrganization || !query.data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const outcome = await captureDeviceGeolocation();
      if (outcome.kind !== "captured") {
        setError("No se obtuvo la ubicación. Puedes continuar sin ella o volver a intentarlo.");
        return;
      }
      await replaceAssistedGeolocation(user.id, activeOrganization.id, requestId, buildGeolocationSubmission(outcome));
      await query.refetch();
    } catch {
      setError("No se pudo guardar la ubicación. Puedes continuar sin ella.");
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
  const savedCount = (["id_document_front", "id_document_back"] as const)
    .filter((type) => item.photos?.some((photo) => photo.evidenceType === type)).length;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.heading}>{savedCount === 2 ? "INE guardada en este teléfono" : "Capturar INE sin conexión"}</Text>
    <Text style={styles.description}>{item.input.first_name} {item.input.last_name}</Text>
    <Text style={styles.description}>Fotografía la INE completa, con luz y sin reflejos. Las fotos quedan cifradas en este teléfono; su calidad se validará al enviarlas.</Text>
    <Card style={savedCount === 2 ? styles.savedCard : styles.card}>
      <Text accessibilityLiveRegion="polite" style={savedCount === 2 ? styles.savedLabel : styles.label}>{savedCount} de 2 fotos guardadas en este teléfono</Text>
      <Text style={styles.description}>{savedCount === 2 ? "Las dos fotos se conservarán al salir. Todavía falta sincronizarlas desde Red para enviarlas al panel de administración." : "Cada foto queda guardada al terminar la captura. Captura el frente y el reverso."}</Text>
    </Card>
    {(["id_document_front", "id_document_back"] as const).map((type) => {
      const saved = item.photos?.some((photo) => photo.evidenceType === type);
      const label = type === "id_document_front" ? "Frente de INE" : "Reverso de INE";
      return <Card key={type} style={saved ? styles.savedCard : styles.card}>
        <Text style={styles.label}>{label}</Text>
        <Text accessibilityLiveRegion="polite" style={saved ? styles.savedLabel : styles.description}>{saved ? "✓ Foto guardada en este teléfono" : "Sin foto guardada"}</Text>
        <Button label={saved ? `Volver a tomar: ${label}` : `Capturar: ${label}`} loading={busy} onPress={() => void capture(type)} />
      </Card>;
    })}
    <Card style={styles.card}>
      <Text style={styles.label}>Ubicación opcional</Text>
      <Text style={styles.description}>Con el consentimiento de la persona, guarda la ubicación de este teléfono durante el registro asistido. No acredita su domicilio. Se conservará protegida y se enviará al sincronizar, junto con la fecha original de captura.</Text>
      <Text accessibilityLiveRegion="polite" style={styles.description}>{item.geolocation?.capture_status === "captured" ? `Ubicación guardada: ${new Date(item.geolocation.captured_at!).toLocaleString("es-MX")}` : "Sin ubicación guardada. Puedes continuar sin compartirla."}</Text>
      <Button label={item.geolocation ? "Actualizar ubicación con consentimiento" : "Compartir ubicación con consentimiento"} loading={busy} onPress={() => void captureLocation()} />
      {item.geolocation && <Button label="Quitar ubicación guardada" variant="secondary" disabled={busy} onPress={() => {
        void replaceAssistedGeolocation(user!.id, activeOrganization!.id, requestId, undefined).then(() => query.refetch()).catch(() => setError("No se pudo quitar la ubicación."));
      }} />}
    </Card>
    <Text style={styles.description}>Al volver la conexión, sincroniza desde Red. El afiliado recibirá un correo para crear su contraseña y completar la verificación desde su propia app. La prueba de vida requiere conexión; también pueden realizarla en este teléfono si siguen juntos y aún no ha activado su cuenta.</Text>
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
  savedCard: { gap: spacing.sm, backgroundColor: colors.semantic.success.soft, borderColor: colors.semantic.success.base },
  savedLabel: { ...typography.bodyStrong, color: colors.success },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  error: { ...typography.body, color: colors.danger },
});
