import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { createAssistedEnrollment, type AssistedEnrollmentInput, type AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { friendlyMessage, isApiError } from "../api/errors";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";
import { removePendingAssisted, savePendingAssisted } from "../services/assistedQueue";

export default function AssistedEnrollmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistedEnrollmentResult | null>(null);
  const [queued, setQueued] = useState(false);

  async function submit() {
    if (!user || !activeOrganization) return;
    if (!firstName.trim() || !lastName.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Escribe nombre, apellido y un correo válido.");
      return;
    }
    if (!consent) {
      setError("La persona debe estar presente y autorizar el registro y el envío de su enlace de acceso.");
      return;
    }
    const input: AssistedEnrollmentInput = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      client_request_id: requestId,
      consent_confirmed: true,
    };
    setError(null);
    setSaving(true);
    try {
      const created = await createAssistedEnrollment(input);
      await removePendingAssisted(requestId);
      setResult(created);
    } catch (cause) {
      if (isApiError(cause) && (cause.kind === "offline" || cause.kind === "timeout")) {
        try {
          await savePendingAssisted({ sponsorUserId: user.id, organizationId: activeOrganization.id, input });
          setQueued(true);
        } catch (storageError) {
          setError(storageError instanceof Error ? storageError.message : "No se pudo guardar en este teléfono.");
        }
      } else {
        setError(isApiError(cause) ? friendlyMessage(cause) : "No se pudo crear el registro. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <IconButton label="Cerrar" onPress={() => router.back()}>
        <Icon name="cerrar" size={18} color={colors.textPrimary} />
      </IconButton>
      <Text style={styles.heading}>Registrar a alguien</Text>
      <Text style={styles.description}>
        Regístralo sin salir de tu cuenta. Su lugar en tu red se crea al sincronizar, y recibirá por correo un enlace para crear su contraseña.
      </Text>
      {result ? (
        <Card style={styles.card}>
          <Text style={styles.success}>Afiliado registrado · {result.affiliate_code}</Text>
          <Text style={styles.description}>Acceso pendiente: debe abrir el correo y crear su contraseña. La verificación de identidad podrá realizarse en este teléfono mientras siga pendiente.</Text>
          <Button label="Volver a Red" onPress={() => router.back()} />
        </Card>
      ) : queued ? (
        <Card style={styles.card}>
          <Text style={styles.success}>Guardado en este teléfono</Text>
          <Text style={styles.description}>Aún no se creó el afiliado ni se envió el correo. Al recuperar la conexión, abre Red y pulsa «Sincronizar registros pendientes».</Text>
          <Button label="Volver a Red" onPress={() => router.back()} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput accessibilityLabel="Nombre" value={firstName} onChangeText={setFirstName} autoCapitalize="words" style={styles.input} />
          <Text style={styles.label}>Apellidos</Text>
          <TextInput accessibilityLabel="Apellidos" value={lastName} onChangeText={setLastName} autoCapitalize="words" style={styles.input} />
          <Text style={styles.label}>Correo de la persona</Text>
          <TextInput accessibilityLabel="Correo de la persona" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <Button
            label={consent ? "Autorización confirmada ✓" : "Confirmar autorización de la persona"}
            variant="secondary"
            onPress={() => setConsent((value) => !value)}
          />
          <Text style={styles.hint}>Confirma solo si la persona está presente y acepta recibir el enlace para terminar su registro.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Registrar" loading={saving} onPress={() => void submit()} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  card: { gap: spacing.sm },
  label: { ...typography.label, color: colors.textPrimary },
  input: { ...typography.body, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary },
  success: { ...typography.subtitle, color: colors.textPrimary },
  error: { ...typography.body, color: colors.danger },
});
