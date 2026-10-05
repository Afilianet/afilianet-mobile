import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useOrganization } from "../state/OrganizationContext";
import { apiRequest } from "../api/client";
import { registerPush } from "../services/push";
import { Button } from "./ui/Button";
import { colors, spacing } from "./ui/theme";

type Preferences = { push_enabled?: boolean; service_push: boolean; promotions: boolean; consent_version: string };
export function PushPreferences() {
  const { activeOrganization } = useOrganization();
  const id = activeOrganization?.id;
  // Remount on organization changes so values/requests cannot cross tenants.
  return id ? <OrganizationPreferences key={id} id={id} name={activeOrganization.name} /> : null;
}
function OrganizationPreferences({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let current = true;
    apiRequest<{ data: Preferences }>("/api/v1/notifications/preferences", { skipOrganization: true, headers: { "X-Organization-ID": id } })
      .then(r => { if (current) setValue(r.data); }).catch(() => { if (current) setMessage("No se pudieron cargar tus preferencias."); });
    return () => { current = false; };
  }, [id]);
  async function save() {
    if (!value) return;
    setBusy(true); setMessage("");
    try {
      await apiRequest("/api/v1/notifications/preferences", { method: "PUT", body: value, skipOrganization: true, headers: { "X-Organization-ID": id } });
      setMessage("Preferencias guardadas para esta organización.");
    } catch { setMessage("No se guardaron los cambios. Intenta de nuevo."); }
    finally { setBusy(false); }
  }
  return <View style={styles.card}>
    <Text style={styles.title}>Notificaciones · {name}</Text>
    <Text>Activa las notificaciones del teléfono para recibir avisos fuera de la app. Puedes seguir usando Afilianet sin permitirlas.</Text>
    <Button label="Activar en este teléfono" variant="secondary" disabled={busy || value?.push_enabled === false} onPress={() => {
      setBusy(true); void registerPush(true).then(ok => setMessage(ok ? "Teléfono registrado." : "No se activaron. Revisa los permisos del teléfono."))
        .catch(() => setMessage("No se pudo registrar el teléfono. Intenta nuevamente." )).finally(() => setBusy(false));
    }} />
    {value?.push_enabled === false ? <Text>Las notificaciones push están en preparación; todavía no se envían mensajes al teléfono.</Text> : null}
    {value ? <>
      <Text>Avisos de cuenta y organización</Text>
      <Switch accessibilityLabel="Avisos de cuenta y organización" value={value.service_push} disabled={busy} onValueChange={v => setValue({ ...value, service_push: v })} />
      <Text>Acepto recibir promociones, ofertas, novedades comerciales y eventos de Afilianet y de {name}, incluidos mensajes dirigidos a mi red dentro de esta organización. Es opcional y puedo desactivarlo aquí en cualquier momento.</Text>
      <Switch accessibilityLabel="Acepto promociones de esta organización" value={value.promotions} disabled={busy} onValueChange={v => setValue({ ...value, promotions: v })} />
      <Button label="Guardar preferencias" loading={busy} onPress={() => void save()} />
    </> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }, title: { fontSize: 18, fontWeight: "600", color: colors.textPrimary } });
