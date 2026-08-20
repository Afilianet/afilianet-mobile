import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, radius, spacing, typography } from "../../components/ui/theme";
import { useOrganization } from "../../state/OrganizationContext";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { organizations, activeOrganization, selectOrganization } = useOrganization();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.name}>
          {user?.first_name} {user?.last_name}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
      </Card>

      {organizations.length > 1 ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Organizations</Text>
          {organizations.map((org) => {
            const isActive = org.id === activeOrganization?.id;
            return (
              <Pressable
                key={org.id}
                onPress={() => selectOrganization(org.id)}
                style={[styles.orgRow, isActive && styles.orgRowActive]}
              >
                <Text style={styles.orgName}>{org.name}</Text>
                {isActive ? <Badge label="Active" tone="success" /> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.xs },
  name: { ...typography.heading, color: colors.textPrimary },
  email: { ...typography.body, color: colors.textSecondary },
  sectionTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  orgRowActive: {
    backgroundColor: colors.background,
  },
  orgName: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
