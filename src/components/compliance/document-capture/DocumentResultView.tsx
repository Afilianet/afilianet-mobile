import { StyleSheet, Text, View } from "react-native";
import type { DocumentProcessingResult } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { fieldDisplayValue, fieldLabel, friendlyFailureReason, verdictCopy } from "./documentCaptureCopy";

/**
 * Read-only. `confirmed_fields` -- the backend's own reserved column for a
 * future user-confirmation flow -- has no submission endpoint yet (see this
 * phase's report), so this deliberately never offers an editable form or a
 * Save/Confirm action that would only pretend to persist a correction.
 * Extracted fields are shown for the affiliate's own awareness only.
 */
export function DocumentResultView({
  result,
  onRetry,
  retrying,
}: {
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
  const fields = result.extracted_fields.filter((field) => field.value !== null);

  return (
    <View style={styles.container}>
      <Badge label={copy.label} tone={copy.tone} />
      {copy.description ? <Text style={styles.description}>{copy.description}</Text> : null}

      {fields.length > 0 ? (
        <View style={styles.fields}>
          <Text style={styles.fieldsTitle}>What we read from your document</Text>
          <Text style={styles.fieldsNote}>
            Editing these details isn&apos;t available yet -- this is for your own review only.
          </Text>
          {fields.map((field) => (
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
  fieldsNote: {
    ...typography.caption,
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
