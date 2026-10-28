import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StepNotices } from "../../hooks/useStepNotices";
import { strings } from "../../i18n";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";
import { NoticeConfirmation } from "./NoticeConfirmation";
import { NoticeDocumentView } from "./NoticeDocumentView";

/**
 * The notices of a registration or join step: each one can be opened here
 * (optional), and one explicit, never preselected box confirms the listed
 * versions were made available. That confirmation is what the step needs;
 * opening a document is not required and never claimed.
 */
export function StepNoticesView({ notices, disabled }: { notices: StepNotices; disabled?: boolean }) {
  const copy = strings.privacyNotices.step;
  const [open, setOpen] = useState<string | null>(null);
  if (notices.status === "loading") return <Text style={styles.info}>{copy.loading}</Text>;
  if (notices.status === "error") {
    return (
      <View style={styles.group}>
        <Text accessibilityRole="alert" style={styles.error}>{copy.loadFailed}</Text>
        <Button label={copy.retry} variant="secondary" onPress={() => notices.reload()} />
      </View>
    );
  }
  if (notices.blockedMessage) {
    return <Text accessibilityRole="alert" style={styles.error} testID="step-notices-blocked">{notices.blockedMessage}</Text>;
  }
  if (notices.items.length === 0) return null;
  const general = notices.items.find((item) => item.kind === "general");
  const organization = notices.items.find((item) => item.kind === "organization");
  return (
    <View style={styles.group} testID="step-notices">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.info}>{copy.intro}</Text>
      {notices.items.map((item) => {
        const isOpen = open === item.key;
        return (
          <Card key={item.key} style={styles.card}>
            <Text style={styles.label}>{item.title}</Text>
            {isOpen ? <NoticeDocumentView document={item.document} /> : null}
            <Button
              label={isOpen ? copy.hide : copy.read}
              variant="ghost"
              accessibilityLabel={`${isOpen ? copy.hide : copy.read}: ${item.title}`}
              onPress={() => {
                if (isOpen) {
                  setOpen(null);
                  return;
                }
                setOpen(item.key);
                notices.markOpened(item.key);
              }}
            />
          </Card>
        );
      })}
      <NoticeConfirmation
        label={copy.confirmation(
          general?.document.version ?? null,
          organization ? { name: organization.organizationName ?? copy.anOrganization, version: organization.document.version } : null,
        )}
        checked={notices.confirmed}
        disabled={disabled}
        onChange={notices.setConfirmed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  info: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
