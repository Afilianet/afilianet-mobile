import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../design-system/icons/Icon";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { routes } from "../navigation/routes";
import { IconButton } from "./ui/IconButton";
import { colors, radius, typography } from "./ui/theme";

/** 0 -> no badge, 1-99 -> exact count, 100+ -> "99+". Always the backend's own unread-count, never a locally-summed page count. */
function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

export function NotificationBell() {
  const router = useRouter();
  const { data: unreadCount } = useUnreadNotificationCount();
  const label = badgeLabel(unreadCount ?? 0);

  return (
    <View style={styles.wrapper}>
      <IconButton
        label={label ? `Notifications, ${unreadCount} unread` : "Notifications"}
        onPress={() => router.push(routes.notifications as never)}
      >
        <Icon name="campana" size={20} color={colors.textPrimary} />
      </IconButton>
      {label ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textOnBrand,
    fontWeight: "700",
  },
});
