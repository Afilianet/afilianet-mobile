import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fetchAssistedEnrollment } from "../../api/assistedEnrollment";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useOrganization } from "../../state/OrganizationContext";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, typography } from "../../components/ui/theme";
import ComplianceScreen from "../compliance";

export default function AssistedVerificationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const query = useApiQuery(
    ["assisted-enrollment", activeOrganization?.id, id],
    () => fetchAssistedEnrollment(id),
    { enabled: Boolean(activeOrganization) && typeof id === "string" },
  );

  if (query.isPending) return <LoadingState message="Abriendo registro asistido…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data || query.data.access_status !== "pending") {
    return <View style={styles.notice}>
      <Text style={styles.text}>Esta persona ya activó su cuenta. Puede continuar su verificación desde su propia sesión.</Text>
      <Button label="Volver a Red" onPress={() => router.back()} />
    </View>;
  }

  return (
    <AssistedComplianceContext.Provider value={query.data.id}>
      <View style={styles.screen} key={`${activeOrganization?.id}:${query.data.id}`}>
        <View style={styles.notice}>
          <Text style={styles.name}>{query.data.first_name} {query.data.last_name} · {query.data.affiliate_code}</Text>
          <Text style={styles.text}>Registro asistido. Las fotos y la prueba de vida deben ser de esta persona.</Text>
        </View>
        <ComplianceScreen />
      </View>
    </AssistedComplianceContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  notice: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceRaised },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textSecondary },
});
