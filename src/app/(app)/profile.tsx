import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { colors, measures, radius, spacing, typography } from "../../components/ui/theme";
import { useOrganization } from "../../state/OrganizationContext";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { organizations, activeOrganization, selectOrganization } = useOrganization();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.identityCard}>
        <Avatar name={`${user?.first_name ?? ""} ${user?.last_name ?? ""}`} size={52} />
        <View style={styles.identityText}>
          <Text style={styles.name}>
            {user?.first_name} {user?.last_name}
          </Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
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
  content: { padding: measures.mobileGutter, gap: spacing.md },
  card: { gap: spacing.xs },
  identityCard: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  identityText: { gap: 2 },
  name: { ...typography.subtitle, color: colors.textPrimary },
  email: { ...typography.body, color: colors.textSecondary },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
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
  orgRowActive: { backgroundColor: colors.surfaceRaised },
  orgName: { ...typography.body, color: colors.textPrimary },
});
