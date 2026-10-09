import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";
import { registerPush } from "../services/push";
import { createAutomaticPushRefresh } from "../services/automaticPushRefresh";
import { analytics } from "../services/analytics";

export function PushLifecycle() {
  const { status, user } = useAuth();
  const userId = user?.id;
  const automaticRefresh = useRef<{ userId: typeof userId; refresh: () => void } | null>(null);
  const router = useRouter();
  const organization = useOrganization();
  const orgRef = useRef(organization);
  // A tap can reach us twice (live listener + cold-start replay). Handle each once.
  const handledResponses = useRef(new Set<string>());
  useEffect(() => { orgRef.current = organization; }, [organization]);
  useEffect(() => {
    if (status !== "signedIn" || !userId || organization.status !== "ready") return;
    if (automaticRefresh.current?.userId !== userId) {
      automaticRefresh.current = { userId, refresh: createAutomaticPushRefresh(() => registerPush(false)) };
    }
    const refresh = automaticRefresh.current.refresh;
    refresh();
    const state = AppState.addEventListener("change", value => { if (value === "active") refresh(); });
    const token = Notifications.addPushTokenListener(refresh);
    // Only a user's tap on a push lands here -- receiving one never does. The
    // push carries no notification id (only organization_id), so a tap opens
    // the inbox and never marks anything read on its own.
    const open = (response: Notifications.NotificationResponse) => {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.current.has(responseKey)) return;
      const organizationId = response.notification.request.content.data?.organization_id;
      if (typeof organizationId !== "string") return;
      const current = orgRef.current;
      if (!current.organizations.some(org => org.id === organizationId)) return;
      handledResponses.current.add(responseKey);
      analytics.capture("push_notification_opened");
      void current.selectOrganization(organizationId).then(() => router.push("/notifications")).catch(() => undefined);
    };
    const response = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(value => {
      if (value) { open(value); void Notifications.clearLastNotificationResponseAsync().catch(() => undefined); }
    }).catch(() => undefined);
    return () => { state.remove(); token.remove(); response.remove(); };
  }, [status, userId, router, organization.status]);
  return null;
}
