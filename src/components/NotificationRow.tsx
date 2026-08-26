import { Pressable, StyleSheet, Text, View } from "react-native";
import { notificationTypeMeta } from "../design-system/notificationMapping";
import { Icon } from "../design-system/icons/Icon";
import type { Notification } from "../types/api";
import { formatDateTime } from "../utils/date";
import { colors, radius, spacing, typography } from "./ui/theme";

/**
 * Unread state is never color-only: an unread row gets a visible dot AND
 * bold title text, and the accessibility label spells out "Unread"/"Read"
 * explicitly for screen readers. Never renders raw `payload` -- only the
 * server's own `title`/`body` (already-trusted display copy) and the
 * type's centralized icon/category (design-system/notificationMapping.ts).
 */
export function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const isUnread = notification.read_at === null;
  const meta = notificationTypeMeta(notification.type);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${isUnread ? "Unread" : "Read"}: ${notification.title}. ${notification.body}. ${formatDateTime(notification.created_at)}`}
      accessibilityHint="Opens this notification"
    >
      <View style={styles.iconMark}>
        <Icon name={meta.icon} size={18} color={colors.textSecondary} />
      </View>

      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={[styles.title, isUnread ? styles.titleUnread : null]} numberOfLines={1}>
            {notification.title}
          </Text>
          {isUnread ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text style={styles.body} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.meta}>{formatDateTime(notification.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  iconMark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleUnread: {
    ...typography.bodyStrong,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
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
