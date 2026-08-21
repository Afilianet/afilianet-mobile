import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../components/ui/Card";
import { colors, spacing, typography } from "../components/ui/theme";
import { routes } from "../navigation/routes";
import { analytics } from "../services/analytics";
import { useOrganization } from "../state/OrganizationContext";

export default function OrganizationPickerScreen() {
  const { organizations, selectOrganization } = useOrganization();
  const router = useRouter();

  async function handleSelect(organizationId: string) {
    await selectOrganization(organizationId);
    analytics.capture("organization_switched");
    router.replace(routes.home as never);
  }

  return (
    <View style={styles.screen}>
      {router.canGoBack() ? (
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>Choose an organization</Text>
      <View style={styles.list}>
        {organizations.map((org) => (
          <Pressable key={org.id} onPress={() => handleSelect(org.id)}>
            <Card style={styles.card}>
              <Text style={styles.orgName}>{org.name}</Text>
              {org.my_role ? <Text style={styles.orgRole}>{org.my_role}</Text> : null}
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  close: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    gap: 2,
  },
  orgName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  orgRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
