import { StyleSheet, Text, View } from "react-native";
import type { NoticeDocument } from "../../api/privacy";
import { strings } from "../../i18n";
import { colors, spacing, typography } from "../ui/theme";

/** The full text of one exact notice version, as served. Nothing is summarized or rewritten. */
export function NoticeDocumentView({ document }: { document: NoticeDocument }) {
  return (
    <View style={styles.body} testID={`notice-text-${document.version}`}>
      <Text style={styles.meta}>{strings.privacyNotices.step.version(document.version)}</Text>
      <Text style={styles.text}>{document.controller_name}</Text>
      <Text style={styles.text}>{document.controller_address}</Text>
      <Text selectable style={styles.text}>{document.contact_email}</Text>
      {document.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.text}>{section.text}</Text>
        </View>
      ))}
      {(document.purposes ?? []).map((purpose) => (
        <View key={purpose.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{purpose.title}</Text>
          <Text style={styles.text}>{purpose.text}</Text>
        </View>
      ))}
      <Text style={styles.meta}>
        {document.deletion_response_days} {document.deletion_response_days_kind}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textTertiary },
});
