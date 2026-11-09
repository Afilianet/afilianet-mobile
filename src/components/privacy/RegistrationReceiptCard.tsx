import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { discardRegistrationReceipt, peekRegistrationReceipt } from "../../auth/registrationReceipt";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";

/**
 * After an account-creating step: each authorization the person ticked, shown
 * as recorded only when the API returned it as stored. Shown once.
 */
export function RegistrationReceiptCard({ userId }: { userId: string }) {
  const router = useRouter();
  const copy = strings.registrationConsents.receipt;
  const [lines] = useState(() => peekRegistrationReceipt(userId));
  useEffect(() => {
    if (lines) discardRegistrationReceipt();
  }, [lines]);
  if (!lines?.length) return null;
  const missing = lines.some((line) => !line.recorded);
  return (
    <Card style={styles.card} testID="registration-receipt">
      <Text style={styles.title}>{copy.title}</Text>
      {lines.map((line) => (
        <Text
          key={line.title}
          accessibilityRole={line.recorded ? undefined : "alert"}
          style={line.recorded ? styles.recorded : styles.missing}
        >
          {line.recorded ? copy.recorded(line.title) : copy.notRecorded(line.title)}
        </Text>
      ))}
      {missing ? <Button label={copy.openPrivacy} variant="secondary" onPress={() => router.push(routes.privacyReview as never)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  recorded: { ...typography.body, color: colors.textSecondary },
  missing: { ...typography.body, color: colors.danger },
});
