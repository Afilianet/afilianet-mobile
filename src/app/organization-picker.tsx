import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { Icon } from "../design-system/icons/Icon";
import { routes } from "../navigation/routes";
import { analytics } from "../services/analytics";
import { useOrganization } from "../state/OrganizationContext";

function humanizeRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ");
}

export default function OrganizationPickerScreen() {
  const { organizations, selectOrganization } = useOrganization();
  const router = useRouter();

  async function handleSelect(organizationId: string) {
    await selectOrganization(organizationId);
    analytics.capture("organization_switched");
    // Reached two different ways: (a) a forced redirect when there's no
    // active org yet (root layout, org-picker is the only stack frame --
    // canGoBack() is false), where replace() is the right non-back-able
    // transition; (b) a voluntary switch pushed on top of an already-mounted
    // Home (canGoBack() is true), where replace() would swap this frame for
    // a *new* Home instance instead of popping back to the one underneath,
    // leaving a redundant duplicate frame on the stack. back() dismisses the
    // picker and reveals that already-mounted Home directly.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home as never);
    }
  }

  return (
    <View style={styles.screen}>
      {router.canGoBack() ? (
        <View style={styles.close}>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>
      ) : null}
      <Text style={styles.title}>Choose an organization</Text>
      <View style={styles.list}>
        {organizations.map((org) => (
          <Pressable
            key={org.id}
            onPress={() => handleSelect(org.id)}
            accessibilityRole="button"
            accessibilityLabel={org.my_role ? `Switch to ${org.name}, role ${humanizeRole(org.my_role)}` : `Switch to ${org.name}`}
          >
            <Card style={styles.card}>
              <Text style={styles.orgName}>{org.name}</Text>
              {org.my_role ? <Text style={styles.orgRole}>{humanizeRole(org.my_role)}</Text> : null}
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
    padding: measures.mobileGutter,
    gap: spacing.lg,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  close: {
    alignSelf: "flex-start",
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
