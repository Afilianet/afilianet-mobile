import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { createAssistedEnrollment, type AssistedEnrollmentInput, type AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { friendlyMessage, isApiError, type ApiError } from "../api/errors";
import { PhoneField } from "../components/account/PhoneField";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { TextInput } from "../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";
import { removePendingAssisted, savePendingAssisted } from "../services/assistedQueue";
import { assistedAccessInstructions, assistedVerificationNote } from "../utils/assistedAccess";
import { DEFAULT_PHONE_COUNTRY, normalizePhone } from "../utils/phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type ContactErrors = { email?: string; phone?: string };

/** The API's 422 for email/phone is Spanish and field-specific (duplicate, invalid); show it on that field. */
function contactErrorsFrom(error: ApiError): ContactErrors {
  const first = (field: "email" | "phone") => {
    const value = error.details?.[field];
    return Array.isArray(value) ? value[0] : value;
  };
  return { email: first("email"), phone: first("phone") };
}

/**
 * Sponsor-assisted registration with the person present: email, mobile or
 * both (at least one), same rules as direct registration. Registering does
 * not verify either channel; the person confirms them from their own account.
 */
export default function AssistedEnrollmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [submitted, setSubmitted] = useState<AssistedEnrollmentInput | null>(null);
  const [consent, setConsent] = useState(false);
  const [requestId] = useState(() => Crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistedEnrollmentResult | null>(null);
  const [queued, setQueued] = useState(false);

  async function submit() {
    if (!user || !activeOrganization || saving) return;
    const normalizedEmail = email.trim().toLowerCase();
    const typedPhone = phone.trim();
    const normalizedPhone = typedPhone ? normalizePhone(country, typedPhone) : null;
    const nextFieldErrors: ContactErrors = {};
    if (normalizedEmail && !EMAIL.test(normalizedEmail)) nextFieldErrors.email = "El correo no es válido.";
    if (typedPhone && !normalizedPhone) nextFieldErrors.phone = "El celular no está completo para el país elegido.";
    setFieldErrors(nextFieldErrors);
    let problem: string | null = null;
    if (!firstName.trim() || !lastName.trim()) problem = "Escribe el nombre y los apellidos de la persona.";
    else if (!normalizedEmail && !typedPhone) problem = "Escribe el correo, el celular o ambos.";
    else if (nextFieldErrors.email || nextFieldErrors.phone) problem = "Revisa el correo o el celular marcados.";
    else if (!consent) problem = "La persona debe estar presente y autorizar el registro, la verificación de identidad y el uso de su correo o celular para su acceso.";
    setError(problem);
    if (problem) return;
    const input: AssistedEnrollmentInput = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      client_request_id: requestId,
      consent_confirmed: true,
    };
    setSaving(true);
    try {
      const created = await createAssistedEnrollment(input);
      await removePendingAssisted(requestId);
      setSubmitted(input);
      setResult(created);
    } catch (cause) {
      if (isApiError(cause) && (cause.kind === "offline" || cause.kind === "timeout")) {
        try {
          await savePendingAssisted({ sponsorUserId: user.id, organizationId: activeOrganization.id, input });
          setSubmitted(input);
          setQueued(true);
        } catch (storageError) {
          setError(storageError instanceof Error ? storageError.message : "No se pudo guardar en este teléfono.");
        }
      } else if (isApiError(cause) && cause.kind === "validation" && (cause.details?.email || cause.details?.phone)) {
        // Everything typed stays in the form; only the rejected field is marked.
        setFieldErrors(contactErrorsFrom(cause));
        setError("Revisa el correo o el celular marcados.");
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
        Regístralo sin salir de tu cuenta con su correo, su celular o ambos. Su lugar en tu red se crea al sincronizar, y después podrá crear su contraseña para entrar desde su propia app.
      </Text>
      {result ? (
        <Card style={styles.card}>
          <Text style={styles.success}>Afiliado registrado · {result.affiliate_code}</Text>
          <Text style={styles.description}>Acceso pendiente: {assistedAccessInstructions(submitted ?? {})}</Text>
          <Text style={styles.description}>{assistedVerificationNote(submitted ?? {})} Si siguen juntos, también pueden verificar su identidad en este teléfono antes de que active su cuenta.</Text>
          <Button label="Verificar identidad ahora" onPress={() => router.replace(`/assisted-verification/${result.id}` as never)} />
          <Button label="Volver a Red" variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : queued ? (
        <Card style={styles.card}>
          <Text style={styles.success}>Guardado en este teléfono</Text>
          <Button label="Capturar INE sin conexión" onPress={() => router.replace(`/assisted-offline/${requestId}` as never)} />
          <Text style={styles.description}>Aún no se creó el afiliado ni se le envió ningún mensaje. Al recuperar la conexión, abre Red y pulsa «Sincronizar registros pendientes».</Text>
          <Button label="Volver a Red" onPress={() => router.back()} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <TextInput label="Nombre" value={firstName} onChangeText={setFirstName} autoCapitalize="words" editable={!saving} />
          <TextInput label="Apellidos" value={lastName} onChangeText={setLastName} autoCapitalize="words" editable={!saving} />
          <Text style={styles.hint}>Escribe su correo, su celular o ambos. Al menos uno es obligatorio.</Text>
          <TextInput
            label="Correo de la persona"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            editable={!saving}
            error={fieldErrors.email}
          />
          <PhoneField
            label="Celular de la persona"
            country={country}
            onCountryChange={setCountry}
            value={phone}
            onChangeText={setPhone}
            error={fieldErrors.phone}
          />
          <Button
            label={consent ? "Autorización confirmada ✓" : "Confirmar autorización de la persona"}
            variant="secondary"
            onPress={() => setConsent((value) => !value)}
          />
          <Text style={styles.hint}>Confirma solo si la persona está presente y acepta registrar sus datos, verificar su identidad y terminar después su acceso con el correo o el celular que escribiste.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
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
  hint: { ...typography.caption, color: colors.textSecondary },
  success: { ...typography.subtitle, color: colors.textPrimary },
  error: { ...typography.body, color: colors.danger },
});
