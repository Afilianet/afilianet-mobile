import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { colors, measures, radius, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { notificationTypeMeta } from "../../design-system/notificationMapping";
import { strings } from "../../i18n";
import { useMarkNotificationRead } from "../../hooks/useMarkNotificationRead";
import { useNotificationDetail } from "../../hooks/useNotificationDetail";
import { notificationDestination, routes } from "../../navigation/routes";
import { formatDateTime } from "../../utils/date";

/**
 * One notification. Resolved through useNotificationDetail, so it works on a
 * cold start or deep link, not only after the inbox loaded it.
 *
 * Opening this screen is the only thing that marks a notification read: a
 * real, per-notification interaction. It fires at most once per mount and
 * only while `read_at` is still null; the API is idempotent as well
 * (markAsRead only writes read_at when it is null). Never marks the rest of
 * the inbox, and receiving a push never reaches this code.
 */
export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQuery = useNotificationDetail(id);
  const { mutate: markRead } = useMarkNotificationRead();
  const markReadAttemptedFor = useRef<string | null>(null);

  const lookup = detailQuery.data;
  const notification = lookup?.kind === "found" ? lookup.notification : undefined;
  const shouldMarkRead = notification !== undefined && notification.read_at === null;

  useEffect(() => {
    if (!shouldMarkRead || !notification || markReadAttemptedFor.current === notification.id) return;
    markReadAttemptedFor.current = notification.id;
    // A failed read is refreshed by the hook and must never block reading the notification.
    markRead(notification.id);
  }, [shouldMarkRead, notification, markRead]);

  let body;
  let showBackToInbox = false;
  if (notification) {
    const meta = notificationTypeMeta(notification.type);
    const destination = notificationDestination(notification.payload.screen);
    const screen = notification.payload.screen;
    const destinationLabel = (screen && strings.notifications.goToSection[screen]) || strings.notifications.goToSectionFallback;
    body = (
      <Card style={styles.card}>
        <View style={styles.iconMark}>
          <Icon name={meta.icon} size={20} color={colors.textSecondary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {notification.title}
        </Text>
        <Text style={styles.body}>{notification.body}</Text>
        <Text style={styles.meta}>{formatDateTime(notification.created_at)}</Text>
        {destination ? (
          <Button label={destinationLabel} variant="secondary" onPress={() => router.push(destination as never)} />
        ) : null}
      </Card>
    );
  } else if (detailQuery.isError) {
    // A failed request is never reported as "not found".
    body = <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} retrying={detailQuery.isFetching} />;
  } else if (lookup?.kind === "absent") {
    showBackToInbox = true;
    body = <EmptyState title={strings.notifications.notFoundTitle} description={strings.notifications.notFoundDescription} />;
  } else if (lookup?.kind === "not_located") {
    showBackToInbox = true;
    body = <EmptyState title={strings.notifications.notLocatedTitle} description={strings.notifications.notLocatedDescription} />;
  } else {
    body = <SkeletonGroup lines={3} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView testID="notification-detail-scroll" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.heading}>{strings.notifications.detailTitle}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
        {body}
        {showBackToInbox ? (
          <Button
            label={strings.notifications.backToInbox}
            variant="ghost"
            onPress={() => router.replace(routes.notifications as never)}
          />
        ) : null}
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
  card: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  iconMark: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
