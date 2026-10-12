import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";
import { registerPush } from "../services/push";
import { createAutomaticPushRefresh } from "../services/automaticPushRefresh";
import { analytics } from "../services/analytics";

// Organization pushes carry organization_id (SendNotificationPush); platform
// pushes carry only screen "platform-notifications" (SendPlatformNotificationPush)
// and never require selecting an organization.
type OpenTarget = { kind: "organization"; organizationId: string } | { kind: "platform" };
type PendingOpen = { key: string; target: OpenTarget; userId: string };

export function PushLifecycle() {
  const { status, user } = useAuth();
  const userId = user?.id;
  const automaticRefresh = useRef<{ userId: typeof userId; refresh: () => void } | null>(null);
  const router = useRouter();
  const organization = useOrganization();
  const orgRef = useRef(organization);
  // A tap can reach us twice (live listener + cold-start replay). Each one
  // is completed at most once; until then it stays pending and is retried.
  const completedOpens = useRef(new Set<string>());
  const pendingOpen = useRef<PendingOpen | null>(null);
  const openInFlight = useRef(false);
  useEffect(() => { orgRef.current = organization; }, [organization]);

  // Signing out or switching accounts drops any tap that was not completed:
  // it must never navigate inside a different session.
  useEffect(() => {
    if (status === "signedIn" && userId) return;
    pendingOpen.current = null;
    completedOpens.current.clear();
    if (status === "signedOut") void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [status, userId]);

  useEffect(() => {
    if (status !== "signedIn" || !userId || organization.status !== "ready") return;
    let active = true;
    if (automaticRefresh.current?.userId !== userId) {
      automaticRefresh.current = { userId, refresh: createAutomaticPushRefresh(() => registerPush(false)) };
    }
    const refresh = automaticRefresh.current.refresh;

    const complete = (pending: PendingOpen, path: string) => {
      pendingOpen.current = null;
      completedOpens.current.add(pending.key);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      analytics.capture("push_notification_opened");
      router.push(path as never);
    };

    // Only a user's tap on a push lands here -- receiving one never does. The
    // push carries no notification id, so a tap opens the matching inbox and
    // never marks anything read on its own.
    const attemptOpen = () => {
      const pending = pendingOpen.current;
      if (!pending || openInFlight.current) return;
      if (pending.userId !== userId) {
        pendingOpen.current = null;
        return;
      }
      const { target } = pending;
      if (target.kind === "platform") {
        complete(pending, "/platform-notifications");
        return;
      }
      const current = orgRef.current;
      if (!current.organizations.some(org => org.id === target.organizationId)) {
        pendingOpen.current = null;
        return;
      }
      openInFlight.current = true;
      current.selectOrganization(target.organizationId)
        .then(() => {
          // Session ended or this effect was torn down meanwhile: navigate
          // nowhere. A still-valid tap stays pending for the next run.
          if (!active || pendingOpen.current !== pending) return;
          complete(pending, "/notifications");
        })
        // Selection failed: keep it pending; retried on foreground or the next effect run.
        .catch(() => undefined)
        .finally(() => {
          openInFlight.current = false;
          // A newer tap arrived while this one was in flight: the latest wins.
          if (active && pendingOpen.current && pendingOpen.current !== pending) attemptOpen();
        });
    };

    const open = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (completedOpens.current.has(key) || pendingOpen.current?.key === key) return;
      const data = response.notification.request.content.data;
      let target: OpenTarget;
      if (typeof data?.organization_id === "string") {
        target = { kind: "organization", organizationId: data.organization_id };
      } else if (data?.screen === "platform-notifications") {
        target = { kind: "platform" };
      } else {
        return;
      }
      pendingOpen.current = { key, target, userId };
      attemptOpen();
    };

    refresh();
    attemptOpen();
    const state = AppState.addEventListener("change", value => {
      if (value !== "active") return;
      refresh();
      attemptOpen();
    });
    const token = Notifications.addPushTokenListener(refresh);
    const response = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(value => {
      if (value && active) open(value);
    }).catch(() => undefined);
    return () => { active = false; state.remove(); token.remove(); response.remove(); };
  }, [status, userId, router, organization.status]);
  return null;
}
