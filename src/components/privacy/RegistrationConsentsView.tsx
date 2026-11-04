import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RegistrationConsents } from "../../hooks/useRegistrationConsents";
import { strings } from "../../i18n";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { colors, spacing, typography } from "../ui/theme";
import { NoticeDocumentView } from "./NoticeDocumentView";

/**
 * The purpose boxes of an account-creating step (registration consents v1),
 * each next to a link to the full notice that defines it, which opens here
 * before deciding. The box text is the purpose's own public `text`, as served.
 * Boxes start unticked; leaving one unticked never blocks the account.
 */
export function RegistrationConsentsView({ consents, disabled }: { consents: RegistrationConsents; disabled?: boolean }) {
  const copy = strings.registrationConsents;
  const [open, setOpen] = useState<string | null>(null);
  if (consents.items.length === 0) return null;
  return (
    <View style={styles.group} testID="registration-consents">
      {consents.items.map((item) => {
        const isOpen = open === item.key;
        const optional = item.optional;
        return (
          <Card key={item.key} style={styles.card} testID={`consent-${item.purpose.key}`}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.purpose.title}</Text>
              {optional ? <Badge label={copy.optional} tone="neutral" /> : null}
            </View>
            <Button
              label={isOpen ? copy.hideNotice : copy.readNotice}
              variant="ghost"
              accessibilityLabel={`${isOpen ? copy.hideNotice : copy.readNotice}: ${item.purpose.title}`}
              onPress={() => setOpen(isOpen ? null : item.key)}
            />
            {isOpen ? <NoticeDocumentView document={item.document} /> : null}
            <Checkbox
              label={item.purpose.text}
              checked={consents.isChecked(item.key)}
              disabled={disabled}
              onChange={(value) => consents.setChecked(item.key, value)}
              testID={`consent-box-${item.purpose.key}`}
            >
              {item.purpose.help ? <Text style={styles.help}>{item.purpose.help}</Text> : null}
            </Checkbox>
            <Text style={styles.note}>{optional ? copy.optionalNote : copy.identityNote}</Text>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: { gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  help: { ...typography.caption, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textTertiary },
});
