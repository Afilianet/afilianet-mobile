import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "../api/client";
import { ApiError } from "../api/errors";

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
}) });

export async function registerPush(requestPermission = false): Promise<boolean> {
  if (Platform.OS === "web" || !Device.isDevice) return false;
  const capabilities = await apiRequest<{ data: { enabled: boolean } }>("/api/v1/push/capabilities", { skipOrganization: true });
  if (!capabilities.data.enabled) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("service", { name: "Avisos de cuenta y organización", importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync("promotions", { name: "Promociones", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await unregisterPush();
    return false;
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("No se pudo configurar el dispositivo para notificaciones.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const token = await Promise.race([
    Notifications.getExpoPushTokenAsync({ projectId }).then(result => result.data),
    new Promise<string>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError("timeout", "La obtención del token de notificaciones tardó demasiado.")), 20000);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  await apiRequest("/api/v1/push/devices", { method: "POST", body: { token }, skipOrganization: true });
  return true;
}

export async function unregisterPush() {
  await apiRequest("/api/v1/push/devices", { method: "DELETE", skipOrganization: true, skipUnauthorizedHandling: true });
}
