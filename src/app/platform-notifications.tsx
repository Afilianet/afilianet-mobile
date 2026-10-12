import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { PlatformPushPreferences } from "../components/PlatformPushPreferences";
import { NotificationRow } from "../components/NotificationRow";
import { PaginatedSectionCard } from "../components/PaginatedSectionCard";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
import { useMarkAllPlatformNotificationsRead } from "../hooks/useMarkAllPlatformNotificationsRead";
import { useMarkPlatformNotificationRead } from "../hooks/useMarkPlatformNotificationRead";
import { usePlatformNotifications } from "../hooks/usePlatformNotifications";
import { usePlatformUnreadNotificationCount } from "../hooks/usePlatformUnreadNotificationCount";
import { notificationDestination } from "../navigation/routes";
import { analytics } from "../services/analytics";
import type { Notification } from "../types/api";

/**
 * Afilianet-wide communications -- reachable regardless of whether the
 * caller currently belongs to any organization at all (mirrors
 * notifications.tsx exactly, minus the organization dimension). Visually
 * distinguished from the organization-scoped screen via NotificationRow's
 * badgeLabel so the two are never visually conflated (per the task's
 * explicit "diferencia visualmente las comunicaciones de Afilianet de las
 * organizacionales").
 */
export default function PlatformNotificationsScreen() {
  const router = useRouter();
  const notificationsQuery = usePlatformNotifications();
  const unreadCountQuery = usePlatformUnreadNotificationCount();
  const markReadMutation = useMarkPlatformNotificationRead();
  const markAllReadMutation = useMarkAllPlatformNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    analytics.capture("platform_notifications_viewed");
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([notificationsQuery.refetch(), unreadCountQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleOpen(notification: Notification) {
    analytics.capture("platform_notification_opened");
    try {
      await markReadMutation.mutateAsync(notification.id);
    } catch {
      // A failed read mutation must never block opening an otherwise-valid notification.
    }
    const destination = notificationDestination(notification.payload.screen);
    if (destination) {
      router.push(destination as never);
    }
  }

  async function handleMarkAllRead() {
    analytics.capture("platform_notifications_mark_all_read");
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
        testID="platform-notifications-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>{strings.platformNotifications.title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        <PlatformPushPreferences />

        {hasUnread ? (
          <View style={styles.markAllRow}>
            <Button
              label={strings.platformNotifications.markAllRead}
              variant="ghost"
              size="sm"
              loading={markAllReadMutation.isPending}
              accessibilityLabel={strings.platformNotifications.markAllReadA11y}
              onPress={() => void handleMarkAllRead()}
            />
            {markAllReadMutation.isError ? <Text style={styles.error}>{strings.platformNotifications.couldNotMarkAllRead}</Text> : null}
          </View>
        ) : null}

        <PaginatedSectionCard
          title={strings.platformNotifications.recentTitle}
          query={notificationsQuery}
          emptyTitle={strings.platformNotifications.noneYet}
          renderItem={(notification) => (
            <NotificationRow
              notification={notification}
              badgeLabel={strings.platformNotifications.badge}
              onPress={() => void handleOpen(notification)}
            />
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
