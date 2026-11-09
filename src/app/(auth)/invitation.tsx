import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { InvitationFinder } from "../../components/account/InvitationFinder";
import { Button } from "../../components/ui/Button";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Logo } from "../../design-system/icons/Logo";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";

/** Signed out with an invitation code or link. Direct sign-up without one is register.tsx. */
export default function InvitationScreen() {
  const router = useRouter();
  const copy = strings.auth.registration;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}><Logo variant="violeta" height={32} /></View>
      <Text style={styles.title}>{strings.auth.join.submit}</Text>
      <Text style={styles.description}>{copy.description}</Text>
      <InvitationFinder />
      <Button label={strings.access.register.title} variant="ghost" onPress={() => router.replace(routes.register as never)} />
      <Button label={strings.auth.join.signIn} variant="ghost" onPress={() => router.replace(routes.login as never)} />
      <Button label="Aviso de privacidad" variant="ghost" onPress={() => router.push("/privacy" as never)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: measures.mobileGutter, gap: spacing.lg, backgroundColor: colors.background },
  brand: { alignItems: "center" },
  title: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
});
