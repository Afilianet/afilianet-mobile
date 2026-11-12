import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NoticeDocument } from "../../api/privacy";
import type { RegistrationConsents } from "../../hooks/useRegistrationConsents";
import { strings } from "../../i18n";
import { Badge } from "../ui/Badge";
import { Checkbox } from "../ui/Checkbox";
import { colors, spacing, typography } from "../ui/theme";
import { NoticeLink, NoticeSheet } from "./NoticeSheet";

/**
 * The optional purpose boxes of an account-creating step (registration
 * consents v1), each apart from the notice confirmation: its purpose title as
 * served, marked optional, its own unticked box whose text is the purpose's
 * public `text`, and a link to the notice that defines it. Leaving it unticked
 * never blocks the account; opening the details never ticks it.
 */
export function RegistrationConsentsView({ consents, disabled }: { consents: RegistrationConsents; disabled?: boolean }) {
  const copy = strings.registrationConsents;
  const [open, setOpen] = useState<{ document: NoticeDocument; title: string } | null>(null);
  if (consents.items.length === 0) return null;
  return (
    <View style={styles.group} testID="registration-consents">
      {consents.items.map((item) => (
        <View key={item.key} style={styles.item} testID={`consent-${item.purpose.key}`}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.purpose.title}</Text>
            {/* The served title may already say so; the tag is never repeated. */}
            {/opcional/i.test(item.purpose.title) ? null : <Badge label={copy.optional} tone="neutral" />}
          </View>
          <Checkbox
            label={item.purpose.text}
            checked={consents.isChecked(item.key)}
            disabled={disabled}
            onChange={(value) => consents.setChecked(item.key, value)}
            testID={`consent-box-${item.purpose.key}`}
          />
          <NoticeLink
            label={copy.details}
            accessibilityLabel={`${copy.details}: ${item.purpose.title}`}
            testID={`consent-details-${item.purpose.key}`}
            onPress={() => setOpen({ document: item.document, title: strings.privacyNotices.step.general })}
          />
        </View>
      ))}
      <NoticeSheet document={open?.document ?? null} title={open?.title ?? ""} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  item: { gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
});
