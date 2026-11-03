import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PlatformPushPreferences } from "../components/PlatformPushPreferences";
import { PushPreferences } from "../components/PushPreferences";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Push permission, device registration and preferences -- reached only from
 * Profile. The bell opens the inbox (notifications.tsx), never this screen.
 * Without an active organization only the platform-wide (Afilianet)
 * preferences exist, so no organization-scoped call is made.
 */
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { activeOrganization } = useOrganization();

  return (
    <View style={styles.screen}>
      <ScrollView testID="notification-settings-scroll" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.heading}>{strings.notifications.settingsTitle}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {activeOrganization ? <PushPreferences /> : <PlatformPushPreferences />}
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
});
