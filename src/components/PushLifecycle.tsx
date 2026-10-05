import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { registerPush } from "../services/push";

export function PushLifecycle() {
  const { status, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status !== "signedIn" || !user) return;
    const refresh = () => { void registerPush(false).catch(() => undefined); };
    refresh();
    const state = AppState.addEventListener("change", value => { if (value === "active") refresh(); });
    const token = Notifications.addPushTokenListener(refresh);
    const open = () => router.push("/notifications");
    const response = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(value => {
      if (value) { open(); void Notifications.clearLastNotificationResponseAsync(); }
    });
    return () => { state.remove(); token.remove(); response.remove(); };
  }, [status, user?.id, router]);
  return null;
}
