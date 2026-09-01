import { StyleSheet, Text, View } from "react-native";
import type { DocumentProcessingResult } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { DocumentConfirmationForm } from "./DocumentConfirmationForm";
import { fieldDisplayValue, fieldLabel, friendlyFailureReason, verdictCopy } from "./documentCaptureCopy";

/**
 * `extracted_fields` (what OCR produced) and `confirmed_fields` (what the
 * affiliate reviewed/confirmed, via PATCH .../document-result -- Phase
 * 9C.2a) stay visually distinct here, never merged into one concept:
 * - `confirmation_status === "pending"` (and verdict isn't `fail` -- see
 *   below) renders the real, editable DocumentConfirmationForm, pre-filled
 *   from extracted_fields.
 * - `confirmation_status === "confirmed"` renders confirmed_fields
 *   read-only, labeled as confirmed.
 * - `confirmation_status === "not_required"` (nothing confirmable was
 *   extracted) falls back to the original read-only extracted_fields
 *   display.
 *
 * Confirmation is NEVER offered as a way to "fix" a failed verification --
 * a `fail` verdict never shows the form, regardless of confirmation_status
 * (Phase 9C.2a's explicit fail/review semantics: confirming does not and
 * cannot override a fail/review verdict, ComplianceStep state, or imply
 * document authenticity).
 */
export function DocumentResultView({
  stepId,
  result,
  onRetry,
  retrying,
}: {
  stepId: string;
  result: DocumentProcessingResult;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (result.status === "failed") {
    return (
      <View style={styles.container}>
        <Badge label="Couldn't process" tone="danger" />
        <Text style={styles.description}>{friendlyFailureReason(result.failure_reason)}</Text>
        <Button label="Retake photo" onPress={onRetry} loading={retrying} />
      </View>
    );
  }

  const copy = verdictCopy(result.verdict);
  const extractedFields = result.extracted_fields.filter((field) => field.value !== null);
  const showConfirmationForm = result.verdict !== "fail" && result.confirmation_status === "pending";
  const isConfirmed = result.confirmation_status === "confirmed" && result.confirmed_fields !== null;

  return (
    <View style={styles.container}>
      <Badge label={copy.label} tone={copy.tone} />
      {copy.description ? <Text style={styles.description}>{copy.description}</Text> : null}

      {isConfirmed ? (
        <View style={styles.fields}>
          <Text style={styles.fieldsTitle}>Your confirmed details</Text>
          {Object.entries(result.confirmed_fields as Record<string, string>).map(([name, value]) => (
            <View
              key={name}
              style={styles.field}
              accessible
              accessibilityLabel={`${fieldLabel(name)}: ${fieldDisplayValue(name, value)}`}
            >
              <Text style={styles.fieldLabel}>{fieldLabel(name)}</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {fieldDisplayValue(name, value)}
              </Text>
            </View>
          ))}
        </View>
      ) : extractedFields.length > 0 && !showConfirmationForm ? (
        <View style={styles.fields}>
          <Text style={styles.fieldsTitle}>What we read from your document</Text>
          {extractedFields.map((field) => (
            <View
              key={field.name}
              style={styles.field}
              accessible
              accessibilityLabel={`${fieldLabel(field.name)}: ${fieldDisplayValue(field.name, field.value)}`}
            >
              <Text style={styles.fieldLabel}>{fieldLabel(field.name)}</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {fieldDisplayValue(field.name, field.value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {showConfirmationForm ? <DocumentConfirmationForm stepId={stepId} result={result} /> : null}

      {result.verdict === "fail" ? <Button label="Try again" onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fields: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  fieldsTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.numeric,
    fontSize: 13,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "right",
  },
});
