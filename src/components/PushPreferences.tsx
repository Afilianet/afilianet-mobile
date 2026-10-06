import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useOrganization } from "../state/OrganizationContext";
import { apiRequest } from "../api/client";
import { ApiError, friendlyMessage } from "../api/errors";
import { registerPush } from "../services/push";
import { Button } from "./ui/Button";
import { colors, spacing } from "./ui/theme";

type Preferences = { push_enabled?: boolean; service_push: boolean; promotions: boolean; consent_version: string };
function failureMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.kind === "validation" && error.details?.consent_version) {
    return "Las condiciones de notificaciones cambiaron. Cierra y vuelve a abrir esta pantalla para revisarlas antes de guardar.";
  }
  return friendlyMessage(error) + (error.status ? " (código " + error.status + ")" : "");
}
export function PushPreferences() {
  const { activeOrganization } = useOrganization();
  const id = activeOrganization?.id;
  return id ? <OrganizationPreferences key={id} id={id} name={activeOrganization.name} /> : null;
}
function OrganizationPreferences({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("");
  const [preferencesMessage, setPreferencesMessage] = useState("");
  useEffect(() => {
    let current = true;
    apiRequest<{ data: Preferences }>("/api/v1/notifications/preferences", { skipOrganization: true, headers: { "X-Organization-ID": id } })
      .then(r => { if (current) setValue(r.data); })
      .catch(error => { if (current) setPreferencesMessage(failureMessage(error, "No se pudieron cargar tus preferencias.")); });
    const refreshPermission = () => {
      void Notifications.getPermissionsAsync().then(permission => {
        if (!current) return;
        setPermissionGranted(permission.granted);
        if (!permission.granted) setRegistered(false);
      }).catch(() => undefined);
    };
    refreshPermission();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refreshPermission(); });
    return () => { current = false; listener.remove(); };
  }, [id]);
  async function activate() {
    if (registering) return;
    setRegistering(true); setDeviceMessage("Registrando este teléfono…");
    try {
      const ok = await registerPush(true);
      setRegistered(ok);
      setPermissionGranted((await Notifications.getPermissionsAsync()).granted);
      setDeviceMessage(ok ? "Teléfono registrado. Ya puede recibir notificaciones." : "El teléfono no quedó registrado. Revisa los permisos en los ajustes.");
    } catch (error) { setDeviceMessage(failureMessage(error, "No se pudo registrar el teléfono. Puedes volver a intentarlo.")); }
    finally { setRegistering(false); }
  }
  async function save() {
    if (!value || saving) return;
    setSaving(true); setPreferencesMessage("");
    try {
      const response = await apiRequest<{ data: Preferences }>("/api/v1/notifications/preferences", {
        method: "PUT", body: { service_push: value.service_push, promotions: value.promotions, consent_version: value.consent_version },
        skipOrganization: true, headers: { "X-Organization-ID": id },
      });
      setValue(response.data);
      setPreferencesMessage("Preferencias guardadas para esta organización.");
    } catch (error) { setPreferencesMessage(failureMessage(error, "No se guardaron los cambios. Intenta de nuevo.")); }
    finally { setSaving(false); }
  }
  function openSettings() {
    void Linking.openSettings().catch(() => setDeviceMessage("Abre Ajustes del teléfono → Afilianet → Notificaciones."));
  }
  return <View style={styles.card}>
    <Text style={styles.title}>Notificaciones · {name}</Text>
    <Text>El permiso del teléfono y tus preferencias por organización se configuran por separado.</Text>
    <Text>{registered ? "Activadas en este teléfono" : permissionGranted ? "Permiso concedido. Confirma el registro para recibir avisos." : "El teléfono necesita permiso para mostrar notificaciones."}</Text>
    {registered ? <Button label="Desactivar en ajustes del teléfono" variant="secondary" onPress={openSettings} /> :
      <Button label="Activar en este teléfono" variant="secondary" loading={registering}
        disabled={!value || value.push_enabled === false} onPress={() => void activate()} />}
    {permissionGranted && !registered ? <Button label="Revisar permisos del teléfono" variant="ghost" onPress={openSettings} /> : null}
    {registered ? <Text>Para desactivarlas, cambia el permiso de Afilianet en los ajustes de Android o iOS.</Text> : null}
    {deviceMessage ? <Text accessibilityLiveRegion="polite">{deviceMessage}</Text> : null}
    {value?.push_enabled === false ? <Text>Las notificaciones push están en preparación; todavía no se envían mensajes al teléfono.</Text> : null}
    {value ? <>
      <Text>Avisos de cuenta y organización</Text>
      <Switch accessibilityLabel="Avisos de cuenta y organización" value={value.service_push} disabled={saving}
        onValueChange={v => setValue({ ...value, service_push: v })} />
      <Text>Acepto recibir promociones, ofertas, novedades comerciales y eventos de Afilianet y de {name}, incluidos mensajes dirigidos a mi red dentro de esta organización. Es opcional y puedo desactivarlo aquí en cualquier momento.</Text>
      <Switch accessibilityLabel="Acepto promociones de esta organización" value={value.promotions} disabled={saving}
        onValueChange={v => setValue({ ...value, promotions: v })} />
      <Button label="Guardar preferencias" loading={saving} onPress={() => void save()} />
    </> : null}
    {preferencesMessage ? <Text accessibilityLiveRegion="polite">{preferencesMessage}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }, title: { fontSize: 18, fontWeight: "600", color: colors.textPrimary } });
