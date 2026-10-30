import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { ActiveOrganizationBar } from "../components/ActiveOrganizationBar";
import { ForbiddenState } from "../components/ForbiddenState";
import { OrganizationAffiliatesSection } from "../components/network/OrganizationAffiliatesSection";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
import { isOrganizationStaff } from "../state/membership";
import { useOrganization } from "../state/OrganizationContext";

/**
 * The organization's affiliates, for staff who also have their own network
 * (from «Mi red»). Staff without a profile see the same list inside «Mi red».
 * Without a staff role nothing is requested; the API checks the role anyway.
 */
export default function OrganizationAffiliatesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const staff = isOrganizationStaff(activeOrganization);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="organization-affiliates-scroll">
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">{strings.organizationAffiliates.title}</Text>
          <IconButton label={strings.common.close} onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
        <ActiveOrganizationBar />
        {staff ? (
          <OrganizationAffiliatesSection key={`organization-affiliates:${user?.id}:${activeOrganization?.id}`} />
        ) : (
          <ForbiddenState area={strings.organizationAffiliates.title.toLowerCase()} onGoBack={() => router.back()} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  heading: { ...typography.title, color: colors.textPrimary, flexShrink: 1 },
});
