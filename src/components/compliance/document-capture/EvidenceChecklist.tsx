import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../../design-system/icons/Icon";
import { strings } from "../../../i18n";
import type { DocumentType, Evidence, EvidenceType } from "../../../types/api";
import { Button } from "../../ui/Button";
import { colors, radius, spacing, typography } from "../../ui/theme";
import { DOCUMENT_TYPE_LABELS, EVIDENCE_TYPE_LABELS, REQUIRED_EVIDENCE } from "./documentCaptureCopy";

export function EvidenceChecklist({
  documentType,
  uploaded,
  submitting,
  submitError,
  onCapture,
  onSubmit,
  onChangeDocumentType,
}: {
  documentType: DocumentType;
  uploaded: Partial<Record<EvidenceType, Evidence>>;
  submitting: boolean;
  submitError: string | null;
  onCapture: (evidenceType: EvidenceType) => void;
  onSubmit: () => void;
  onChangeDocumentType: () => void;
}) {
  const required = REQUIRED_EVIDENCE[documentType];
  const allUploaded = required.every((type) => uploaded[type]?.status === "uploaded");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{DOCUMENT_TYPE_LABELS[documentType]}</Text>
      {required.map((evidenceType) => {
        const isUploaded = uploaded[evidenceType]?.status === "uploaded";
        return (
          <Pressable
            key={evidenceType}
            onPress={() => onCapture(evidenceType)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${EVIDENCE_TYPE_LABELS[evidenceType]}, ${isUploaded ? strings.documentCapture.captured : strings.documentCapture.notYetCaptured}`}
            accessibilityHint={isUploaded ? strings.documentCapture.retakeHint : strings.documentCapture.captureHint}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{EVIDENCE_TYPE_LABELS[evidenceType]}</Text>
              <Text style={[styles.rowStatus, isUploaded ? styles.rowStatusDone : null]}>
                {isUploaded ? strings.documentCapture.captured : strings.documentCapture.notYetCaptured}
              </Text>
            </View>
            <Icon
              name={isUploaded ? "check" : "reloj"}
              size={18}
              color={isUploaded ? colors.success : colors.textTertiary}
            />
          </Pressable>
        );
      })}

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

      <Button
        label={strings.documentCapture.submitForVerification}
        fullWidth
        disabled={!allUploaded}
        loading={submitting}
        onPress={onSubmit}
      />
      <Button label={strings.documentCapture.useDifferentDocument} variant="ghost" size="sm" onPress={onChangeDocumentType} />
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {
    gap: 2,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowStatus: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  rowStatusDone: {
    color: colors.success,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
