import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { NotificationRow } from "../components/NotificationRow";
import { PaginatedSectionCard } from "../components/PaginatedSectionCard";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
import { useMarkAllNotificationsRead } from "../hooks/useMarkAllNotificationsRead";
import { useNotifications } from "../hooks/useNotifications";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { notificationDetail } from "../navigation/routes";
import { analytics } from "../services/analytics";
import type { Notification } from "../types/api";

/**
 * Inbox only -- the bell opens this screen. Push preferences live in
 * notification-settings.tsx, reached from Profile.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const notificationsQuery = useNotifications();
  const unreadCountQuery = useUnreadNotificationCount();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    analytics.capture("notifications_viewed");
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([notificationsQuery.refetch(), unreadCountQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  // Viewing the inbox never marks anything read. Only opening one
  // notification's detail does (see notification/[id].tsx), and only that one.
  function handleOpen(notification: Notification) {
    analytics.capture("notification_opened");
    router.push(notificationDetail(notification.id) as never);
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
      <ScrollView
        testID="notifications-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>{strings.notifications.title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {hasUnread ? (
          <View style={styles.markAllRow}>
            <Button
              label={strings.notifications.markAllRead}
              variant="ghost"
              size="sm"
              loading={markAllReadMutation.isPending}
              accessibilityLabel={strings.notifications.markAllReadA11y}
              onPress={() => void handleMarkAllRead()}
            />
            {markAllReadMutation.isError ? <Text style={styles.error}>{strings.notifications.couldNotMarkAllRead}</Text> : null}
          </View>
        ) : null}

        <PaginatedSectionCard
          title={strings.notifications.recentTitle}
          query={notificationsQuery}
          emptyTitle={strings.notifications.noneYet}
          renderItem={(notification) => (
            <NotificationRow notification={notification} onPress={() => handleOpen(notification)} />
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
