import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StepNoticeItem, StepNotices } from "../../hooks/useStepNotices";
import { strings } from "../../i18n";
import { Button } from "../ui/Button";
import { colors, spacing, typography } from "../ui/theme";
import { NoticeConfirmation } from "./NoticeConfirmation";
import { NoticeLink, NoticeSheet } from "./NoticeSheet";

/**
 * The notices of a registration or join step, compact: the approved
 * simplified notice as served, a link per listed version that opens its full
 * text over the form (NoticeSheet), and one explicit, never preselected box
 * confirming those versions were made available. Opening a document is not
 * required, never ticks the box and never touches the form.
 */
export function StepNoticesView({ notices, disabled }: { notices: StepNotices; disabled?: boolean }) {
  const copy = strings.privacyNotices.step;
  const [open, setOpen] = useState<StepNoticeItem | null>(null);
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
  const linkLabel = (item: StepNoticeItem) => (item.kind === "general" ? copy.link : item.title);
  return (
    <View style={styles.group} testID="step-notices">
      {/* Registration consents v1: the simplified notice as served; nothing asks to accept it. */}
      {general?.document.simplified_notice ? (
        <Text style={styles.simplified} testID="simplified-notice">{general.document.simplified_notice}</Text>
      ) : null}
      <View style={styles.links}>
        {notices.items.map((item) => (
          <NoticeLink
            key={item.key}
            label={linkLabel(item)}
            accessibilityLabel={`${linkLabel(item)}, ${copy.version(item.document.version)}`}
            testID={`notice-link-${item.kind}`}
            onPress={() => {
              setOpen(item);
              notices.markOpened(item.key);
            }}
          />
        ))}
      </View>
      <NoticeConfirmation
        label={copy.confirmation(
          general?.document.version ?? null,
          organization ? { name: organization.organizationName ?? copy.anOrganization, version: organization.document.version } : null,
        )}
        checked={notices.confirmed}
        disabled={disabled}
        onChange={notices.setConfirmed}
      />
      <NoticeSheet document={open?.document ?? null} title={open ? open.title : ""} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md },
  simplified: { ...typography.caption, color: colors.textSecondary },
  info: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
