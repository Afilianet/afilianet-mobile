import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useDocumentGeolocation } from "../../../hooks/useDocumentGeolocation";
import { strings } from "../../../i18n";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { colors, spacing, typography } from "../../ui/theme";

/**
 * Phase 9F.2: the explicit, Spanish-only pre-permission explanation shown
 * ONCE per identity_document capture attempt, before this app ever asks the
 * OS for location permission. Neither button blocks the document flow:
 * `onDone` fires the instant a button is pressed, before the (fire-and-
 * forget) permission/position/submit work even resolves -- the parent
 * moves on to evidence capture immediately regardless of what happens with
 * location afterwards. The caller is expected to remount this component
 * (via a fresh `key`) once per new capture attempt/retry -- see
 * DocumentCaptureFlow.tsx -- which is what allows a retry to submit a new
 * observation while a same-attempt double-tap can't submit two.
 */
export function DocumentGeolocationConsent({ stepId, onDone }: { stepId: string; onDone: () => void }) {
  const { allow, continueWithoutLocation } = useDocumentGeolocation(stepId);
  const [answered, setAnswered] = useState(false);

  function handleAllow() {
    if (answered) return;
    setAnswered(true);
    allow();
    onDone();
  }

  function handleContinueWithoutLocation() {
    if (answered) return;
    setAnswered(true);
    continueWithoutLocation();
    onDone();
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{strings.documentCapture.geolocation.title}</Text>
      <Text style={styles.message}>{strings.documentCapture.geolocation.message}</Text>
      <View style={styles.actions}>
        <Button label={strings.documentCapture.geolocation.allow} onPress={handleAllow} disabled={answered} />
        <Button
          label={strings.documentCapture.geolocation.continueWithout}
          variant="ghost"
          onPress={handleContinueWithoutLocation}
          disabled={answered}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.sm,
  },
});
