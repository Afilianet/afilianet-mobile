import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NoticeDocument } from "../../api/privacy";
import { strings } from "../../i18n";
import { Button } from "../ui/Button";
import { colors, measures, spacing, typography } from "../ui/theme";
import { NoticeDocumentView } from "./NoticeDocumentView";

/**
 * The full text of the exact notice version a step lists, over the form
 * instead of inside it. Opening or closing it never ticks a box nor touches
 * what was typed: the form stays mounted underneath.
 */
export function NoticeSheet({ document, title, onClose }: { document: NoticeDocument | null; title: string; onClose: () => void }) {
  return (
    <Modal visible={document !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {document ? (
        <View style={styles.screen} testID="notice-sheet">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Button label={strings.privacyNotices.step.close} variant="ghost" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <NoticeDocumentView document={document} />
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

/** A plain text link: it only opens something, so it reads and behaves as one. */
export function NoticeLink({ label, onPress, accessibilityLabel, testID }: { label: string; onPress: () => void; accessibilityLabel?: string; testID?: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} hitSlop={8} style={styles.link} testID={testID}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    paddingHorizontal: measures.mobileGutter, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  content: { padding: measures.mobileGutter, paddingBottom: spacing.xl },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  linkText: { ...typography.bodyStrong, color: colors.primary, textDecorationLine: "underline" },
});
