import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../api/errors";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { colors, spacing, typography } from "../../components/ui/theme";
import { useAuth } from "../../auth/AuthContext";
import { useOrganization } from "../../state/OrganizationContext";
import { useHomeDashboard } from "../../hooks/useHomeDashboard";
import { formatMoney } from "../../utils/money";
import type { UseQueryResult } from "@tanstack/react-query";

export default function HomeScreen() {
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const { affiliate, wallet, commissions, compliance } = useHomeDashboard();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>
        {user ? `Hi, ${user.first_name}` : "Welcome"}
      </Text>
      <Text style={styles.orgName}>{activeOrganization?.name ?? "No organization selected"}</Text>

      <DashboardCard title="Affiliate status" query={affiliate}>
        {(data) => (
          <View style={styles.row}>
            <Badge label={data.status} tone={data.status === "active" ? "success" : "neutral"} />
            <Text style={styles.meta}>{data.affiliate_code}</Text>
          </View>
        )}
      </DashboardCard>

      <DashboardCard title="Commissions" query={commissions}>
        {(data) => {
          const latest = data[0];
          return (
            <View>
              <Text style={styles.bigNumber}>{data.length}</Text>
              <Text style={styles.meta}>
                {latest ? `Most recent: ${latest.status}` : "No commissions yet"}
              </Text>
            </View>
          );
        }}
      </DashboardCard>

      <DashboardCard title="Wallet" query={wallet}>
        {(data) =>
          data.length === 0 ? (
            <Text style={styles.meta}>No wallet balance yet</Text>
          ) : (
            <View style={{ gap: spacing.xs }}>
              {data.map((walletSummary) => (
                <Text key={walletSummary.currency} style={styles.bigNumber}>
                  {formatMoney(walletSummary.available_balance, walletSummary.currency)}
                </Text>
              ))}
            </View>
          )
        }
      </DashboardCard>

      <DashboardCard title="Compliance" query={compliance}>
        {(data) => (
          <View style={styles.row}>
            <Badge label={data.status} tone={data.status === "approved" ? "success" : "warning"} />
            {data.current_step ? <Text style={styles.meta}>{data.current_step}</Text> : null}
          </View>
        )}
      </DashboardCard>
    </ScrollView>
  );
}

function DashboardCard<T>({
  title,
  query,
  children,
}: {
  title: string;
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {query.isLoading ? (
        <Text style={styles.meta}>Loading...</Text>
      ) : query.isError ? (
        <Text style={styles.error}>
          {isApiError(query.error) ? friendlyMessage(query.error) : "Couldn't load this."}
        </Text>
      ) : query.data !== undefined ? (
        children(query.data)
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  orgName: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bigNumber: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
