import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { strings } from "../i18n";
import { useOrganization } from "../state/OrganizationContext";
import { Button } from "./ui/Button";
import { colors, spacing, typography } from "./ui/theme";

/**
 * «Actualizar»: asks the server again for this account's organizations
 * (GET /me/organizations) and nothing else. If the list changed, the root
 * navigation moves on by itself; if not, it says so. Never creates an
 * invitation or a profile.
 */
export function OrganizationReloadButton({ variant = "secondary" }: { variant?: "secondary" | "ghost" }) {
  const { reloadOrganizations, organizations } = useOrganization();
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState(false);
  if (!reloadOrganizations) return null;
  const before = organizations.length;
  return (
    <View style={styles.group}>
      <Button
        label={strings.organizationReload.button}
        variant={variant}
        loading={pending}
        testID="organization-reload"
        onPress={() => {
          if (pending) return;
          setPending(true);
          setChecked(false);
          void reloadOrganizations().finally(() => { setPending(false); setChecked(true); });
        }}
      />
      {checked && !pending && organizations.length === before ? (
        <Text accessibilityLiveRegion="polite" style={styles.note}>{strings.organizationReload.unchanged}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  note: { ...typography.caption, color: colors.textSecondary },
});
