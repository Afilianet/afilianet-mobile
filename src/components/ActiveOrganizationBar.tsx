import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { strings } from "../i18n";
import { routes } from "../navigation/routes";
import { useOrganization } from "../state/OrganizationContext";
import { Button } from "./ui/Button";
import { colors, radius, spacing, typography } from "./ui/theme";

/**
 * Which organization everything on this screen belongs to, and how to change
 * it -- the same bar, in the same place (right under the screen title), on
 * every main section. A long name wraps instead of being cut. «Cambiar» only
 * appears when there is another organization to change to.
 */
export function ActiveOrganizationBar() {
  const { activeOrganization, organizations } = useOrganization();
  const router = useRouter();
  const copy = strings.organizationBar;
  const name = activeOrganization?.name ?? strings.home.noOrganizationSelected;
  const canChange = organizations.length > 1;

  return (
    <View style={styles.bar} testID="active-organization-bar">
      <View style={styles.text} accessible accessibilityLabel={copy.a11y(name)}>
        <Text style={styles.label}>{copy.label}</Text>
        <Text style={styles.name}>{name}</Text>
      </View>
      {canChange ? (
        <Button
          label={copy.change}
          variant="secondary"
          size="sm"
          accessibilityLabel={copy.changeA11y(name)}
          onPress={() => router.push(routes.organizationPicker as never)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { flexShrink: 1, flexGrow: 1, minWidth: 160, gap: 2 },
  label: { ...typography.caption, color: colors.textTertiary },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
});
