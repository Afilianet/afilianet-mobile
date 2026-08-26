import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NotificationRow } from "../components/NotificationRow";
import { PaginatedSectionCard } from "../components/PaginatedSectionCard";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { useMarkAllNotificationsRead } from "../hooks/useMarkAllNotificationsRead";
import { useMarkNotificationRead } from "../hooks/useMarkNotificationRead";
import { useNotifications } from "../hooks/useNotifications";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { notificationDestination } from "../navigation/routes";
import { analytics } from "../services/analytics";
import type { Notification } from "../types/api";

export default function NotificationsScreen() {
  const router = useRouter();
  const notificationsQuery = useNotifications();
  const unreadCountQuery = useUnreadNotificationCount();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  useEffect(() => {
    analytics.capture("notifications_viewed");
  }, []);

  async function handleOpen(notification: Notification) {
    analytics.capture("notification_opened");
    try {
      await markReadMutation.mutateAsync(notification.id);
    } catch {
      // Refresh already happens inside useMarkNotificationRead's onError --
      // a failed read mutation must never block opening an otherwise-valid
      // notification below.
    }
    const destination = notificationDestination(notification.payload.screen);
    if (destination) {
      router.push(destination as never);
    }
  }

  async function handleMarkAllRead() {
    analytics.capture("notifications_mark_all_read");
    try {
      await markAllReadMutation.mutateAsync();
    } catch {
      // The mutation's own state (isError) surfaces a retry via the button below.
    }
  }

  const hasUnread = (unreadCountQuery.data ?? 0) > 0;

  return (
    <View style={styles.screen}>
      <ScrollView testID="notifications-scroll" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.heading}>Notifications</Text>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {hasUnread ? (
          <View style={styles.markAllRow}>
            <Button
              label="Mark all as read"
              variant="ghost"
              size="sm"
              loading={markAllReadMutation.isPending}
              accessibilityLabel="Mark all notifications as read"
              onPress={() => void handleMarkAllRead()}
            />
            {markAllReadMutation.isError ? <Text style={styles.error}>Couldn&apos;t mark all as read. Try again.</Text> : null}
          </View>
        ) : null}

        <PaginatedSectionCard
          title="Recent notifications"
          query={notificationsQuery}
          emptyTitle="No notifications yet"
          renderItem={(notification) => (
            <NotificationRow notification={notification} onPress={() => void handleOpen(notification)} />
          )}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  markAllRow: {
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
