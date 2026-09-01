import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../ui/theme";
import { DOCUMENT_TYPE_LABELS, EVIDENCE_TYPE_LABELS, REQUIRED_EVIDENCE } from "./documentCaptureCopy";
import type { DocumentType } from "../../../types/api";

const OPTIONS: DocumentType[] = ["mx_ine", "passport"];

/**
 * afilianet-api never determines the document type itself -- `document_type`
 * is client-declared intent at trigger time (DOCUMENT_ENGINE.md section B),
 * so the affiliate always chooses between exactly the two backend-supported
 * types, never an arbitrary/invented option.
 */
export function DocumentTypeSelector({ onSelect }: { onSelect: (type: DocumentType) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Which document will you provide?</Text>
      {OPTIONS.map((type) => {
        const required = REQUIRED_EVIDENCE[type].map((evidenceType) => EVIDENCE_TYPE_LABELS[evidenceType]).join(" + ");
        return (
          <Pressable
            key={type}
            onPress={() => onSelect(type)}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel={`${DOCUMENT_TYPE_LABELS[type]}, requires ${required}`}
          >
            <Text style={styles.optionLabel}>{DOCUMENT_TYPE_LABELS[type]}</Text>
            <Text style={styles.optionMeta}>Requires: {required}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  option: {
    minHeight: 44,
    justifyContent: "center",
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
