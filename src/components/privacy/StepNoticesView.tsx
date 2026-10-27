import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StepNotices } from "../../hooks/useStepNotices";
import { strings } from "../../i18n";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";
import { NoticeDocumentView } from "./NoticeDocumentView";

/**
 * The notices of a registration or join step. Each one is opened by the
 * person before the step can be sent; opening it is what marks it as shown.
 * There is no checkbox: a notice is information, not consent.
 */
export function StepNoticesView({ notices }: { notices: StepNotices }) {
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
  return (
    <View style={styles.group} testID="step-notices">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.info}>{copy.intro}</Text>
      {notices.items.map((item) => {
        const isOpen = open === item.key;
        const shown = notices.isShown(item.key);
        return (
          <Card key={item.key} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{item.title}</Text>
              {shown ? <Badge label={copy.shown} tone="success" /> : null}
            </View>
            {isOpen ? <NoticeDocumentView document={item.document} /> : null}
            <Button
              label={isOpen ? copy.hide : copy.read}
              variant="secondary"
              accessibilityLabel={`${isOpen ? copy.hide : copy.read}: ${item.title}`}
              onPress={() => {
                if (isOpen) {
                  setOpen(null);
                  return;
                }
                setOpen(item.key);
                notices.markShown(item.key);
              }}
            />
          </Card>
        );
      })}
      {notices.allShown ? null : <Text style={styles.info}>{copy.mustRead}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  label: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  info: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
