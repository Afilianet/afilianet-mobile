import { StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import type { DocumentProcessingResult } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { fieldDisplayValue, fieldLabel, friendlyFailureReason, verdictCopy } from "./documentCaptureCopy";

/** Display OCR data read-only. Staff correct missing ID fields in the Admin panel. */
export function DocumentResultView({
  result,
  onRetry,
  retrying,
  hideReviewBadge = false,
}: {
  result: DocumentProcessingResult;
  onRetry: () => void;
  retrying: boolean;
  hideReviewBadge?: boolean;
}) {
  if (result.capture_accepted) {
    const visibleFields = (result.extracted_fields ?? []).filter((field) => field.value !== null);
    return (
      <View style={styles.container}>
        <Badge label={strings.documentCapture.captureAcceptedTitle} tone="success" />
        <Text style={styles.description}>{strings.documentCapture.captureAcceptedDescription}</Text>
        {visibleFields.length > 0 ? (
          <View style={styles.fields}>
            <Text style={styles.fieldsTitle}>{strings.documentCapture.whatWeRead}</Text>
            {visibleFields.map((field) => (
              <View key={field.name} style={styles.field}>
                <Text style={styles.fieldLabel}>{fieldLabel(field.name)}</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {fieldDisplayValue(field.name, field.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (result.status === "failed") {
    return (
      <View style={styles.container}>
        <Badge label={strings.documentCapture.couldNotProcess} tone="danger" />
        <Text style={styles.description}>{friendlyFailureReason(result.failure_reason)}</Text>
        <Button label={strings.documentCapture.retakePhoto} onPress={onRetry} loading={retrying} />
      </View>
    );
  }

  const copy = verdictCopy(result.verdict);
  const extractedFields = result.extracted_fields.filter((field) => field.value !== null);
  // Only a missing CURP can be added manually to an INE review. Confirming
  // address and CURP without a name would still leave the step unresolved.
  const missingIneName = result.document_type === "mx_ine" && result.verdict === "review" && result.confirmation_status === "pending" &&
    (!extractedFields.some((field) => field.name === "first_name" && field.value?.trim()) ||
      !extractedFields.some((field) => (field.name === "paternal_last_name" || field.name === "maternal_last_name") && field.value?.trim()));
  const description = missingIneName
    ? strings.documentCapture.missingNameRetakeDescription
    : result.verdict === "review" && result.confirmation_status === "confirmed"
      ? strings.documentCapture.reviewRetryConfirmedDescription
      : copy.description;
  const isConfirmed = result.confirmation_status === "confirmed" && result.confirmed_fields !== null;

  return (
    <View style={styles.container}>
      {result.verdict === "review" && hideReviewBadge ? null : <Badge label={copy.label} tone={copy.tone} />}
      {description ? <Text style={styles.description}>{description}</Text> : null}

      {isConfirmed ? (
        <View style={styles.fields}>
          <Text style={styles.fieldsTitle}>{strings.documentCapture.yourConfirmedDetails}</Text>
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
      ) : extractedFields.length > 0 ? (
        <View style={styles.fields}>
          <Text style={styles.fieldsTitle}>{strings.documentCapture.whatWeRead}</Text>
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

      {result.confirmation_status === "pending" ? <Text style={styles.description}>{strings.documentCapture.staffReviewDetails}</Text> : null}

      {result.verdict === "fail" || result.verdict === "review" ? (
        <Button
          label={result.verdict === "review" ? strings.documentCapture.retakeDocument : strings.documentCapture.tryAgain}
          onPress={onRetry}
          loading={retrying}
        />
      ) : null}
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
