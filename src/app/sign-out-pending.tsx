import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { syncOutbox } from "../features/surveys/outbox";
import { surveySource } from "../features/surveys/runtime";
import { pendingSurveyData, type PendingSurveyData } from "../features/surveys/signOut";
import { wipeScope } from "../features/surveys/vault";
import { strings } from "../i18n";
import { useOrganization } from "../state/OrganizationContext";

/**
 * Sign-out when this account still has survey data on the phone. Nothing
 * happens without an explicit choice: sync, keep (encrypted, only ever sent
 * again under this same account), delete (confirmed), or cancel.
 */
export default function SignOutPendingScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { organizations, activeOrganization } = useOrganization();
  const copy = strings.surveys.signOut;
  const [pending, setPending] = useState<PendingSurveyData[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setPending(await pendingSurveyData(user.id));
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const total = (pending ?? []).reduce((sum, value) => sum + value.unsent + value.drafts, 0);
  const activePending = pending?.find((value) => value.scope.organizationId === activeOrganization?.id && value.unsent > 0);

  async function syncActive() {
    if (!activePending) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncOutbox(activePending.scope, surveySource, { force: true });
      setMessage(
        result.stoppedReason === "offline"
          ? strings.surveys.outbox.offline
          : result.received
            ? strings.surveys.outbox.done(result.received)
            : strings.surveys.outbox.someFailed,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  function wipeAndSignOut() {
    Alert.alert(copy.wipe, copy.wipeConfirm, [
      { text: copy.cancel, style: "cancel" },
      {
        text: copy.wipe,
        style: "destructive",
        onPress: () =>
          void (async () => {
            setBusy(true);
            for (const value of pending ?? []) await wipeScope(value.scope);
            await signOut();
          })(),
      },
    ]);
  }

  const organizationName = (organizationId: string) => organizations.find((value) => value.id === organizationId)?.name ?? organizationId;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="sign-out-pending">
      <Text style={styles.heading} accessibilityRole="header">{copy.title}</Text>
      {pending ? <Text style={styles.body}>{copy.description(total)}</Text> : null}
      {(pending ?? []).map((value) => (
        <Card key={value.scope.organizationId} style={styles.card}>
          <Text style={styles.cardTitle}>{organizationName(value.scope.organizationId)}</Text>
          {value.unsent ? <Text style={styles.body}>{`${strings.surveys.outbox.pendingSync}: ${value.unsent}`}</Text> : null}
          {value.drafts ? <Text style={styles.body}>{`${strings.surveys.drafts}: ${value.drafts}`}</Text> : null}
        </Card>
      ))}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
      <View style={styles.actions}>
        {activePending ? <Button label={copy.syncNow} loading={busy} onPress={() => void syncActive()} /> : null}
        <Button label={copy.keep} variant="secondary" disabled={busy} onPress={() => void signOut()} />
        <Text style={styles.meta}>{copy.keepNote}</Text>
        <Button label={copy.wipe} variant="danger" disabled={busy || !pending?.length} onPress={wipeAndSignOut} />
        <Button label={copy.cancel} variant="ghost" disabled={busy} onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  card: { gap: spacing.xs },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
  actions: { gap: spacing.sm },
});
