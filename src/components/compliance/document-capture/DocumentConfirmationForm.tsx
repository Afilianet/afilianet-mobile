import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useConfirmDocumentResult } from "../../../hooks/useConfirmDocumentResult";
import { analytics } from "../../../services/analytics";
import type { DocumentProcessingResult } from "../../../types/api";
import { Button } from "../../ui/Button";
import { TextInput } from "../../ui/TextInput";
import { colors, spacing, typography } from "../../ui/theme";
import { confirmationFieldHelperText, fieldLabel, MONO_CONFIRMATION_FIELDS } from "./documentCaptureCopy";

/**
 * The real confirm/correct form for a result's extracted fields
 * (Phase 9C.2a) -- PATCH .../document-result. Confirming here NEVER marks
 * the ComplianceStep/ComplianceCase approved/passed locally (the backend
 * itself never touches that state for a confirmation -- see
 * DocumentProcessingService::confirmResult()'s docblock in afilianet-api);
 * this component only ever renders while `result.confirmation_status ===
 * "pending"` (see DocumentResultView) and never for a `fail` verdict --
 * confirmation is never presented as a way to "fix" a failed verification.
 *
 * Inputs are pre-filled with the RAW extracted value (e.g. "1990-05-15"),
 * never the human-formatted display value used elsewhere -- that's exactly
 * what gets submitted, so there's no silent reformat/parse step that could
 * turn a correction into something the backend rejects unexpectedly.
 */
export function DocumentConfirmationForm({ stepId, result }: { stepId: string; result: DocumentProcessingResult }) {
  // Confirmable fields are exactly the extracted fields with a real value --
  // never a broader/invented schema. Every field a parser emits is already
  // in afilianet-api's DocumentConfirmableFields allowlist (see
  // DOCUMENT_ENGINE.md sections F/G/J2), so deriving purely from
  // extracted_fields here is safe and never submits a field the backend
  // wouldn't recognize.
  const confirmableFields = result.extracted_fields.filter((field) => field.value !== null);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(confirmableFields.map((field) => [field.name, field.value as string])),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const confirmMutation = useConfirmDocumentResult(stepId);

  function updateValue(name: string, value: string) {
    // Preserve the user's edit even after a failed submission -- never
    // clear the form on error (Phase 9C.2a's validation-error requirement).
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleConfirm() {
    setFormError(null);
    setFieldErrors({});
    try {
      await confirmMutation.mutateAsync(values);
      // No field names or values -- matches this app's zero-property
      // analytics convention for compliance events (see
      // document_processing_triggered/document_evidence_captured).
      analytics.capture("document_fields_confirmed");
    } catch (error) {
      if (!isApiError(error)) {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      // A changed re-confirmation after this result was already confirmed
      // is a hard stop, never an auto-retry or silent overwrite -- the
      // hook itself already triggered a refetch, which will replace this
      // form with the CONFIRMED (authoritative) values once it lands.
      if (error.status === 409) {
        setFormError("This document's information was already confirmed. Showing the confirmed details.");
        return;
      }
      if (error.kind === "validation" && error.details) {
        const nextFieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.details)) {
          if (!(field in values)) continue; // never surface an error for a field this form didn't send
          const message = Array.isArray(messages) ? messages[0] : messages;
          if (message) nextFieldErrors[field] = message;
        }
        setFieldErrors(nextFieldErrors);
        if (Object.keys(nextFieldErrors).length === 0) setFormError(friendlyMessage(error));
        return;
      }
      setFormError(friendlyMessage(error));
    }
  }

  if (confirmableFields.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm your details</Text>
      <Text style={styles.note}>
        Review what we read from your document and correct anything that isn&apos;t right, then confirm. This confirms
        these are your identity details -- it doesn&apos;t change your verification result.
      </Text>
      {confirmableFields.map((field) => (
        <TextInput
          key={field.name}
          label={fieldLabel(field.name)}
          value={values[field.name] ?? ""}
          onChangeText={(text) => updateValue(field.name, text)}
          error={fieldErrors[field.name]}
          helperText={confirmationFieldHelperText(field.name)}
          mono={MONO_CONFIRMATION_FIELDS.has(field.name)}
          editable={!confirmMutation.isPending}
        />
      ))}
      {formError ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button label="Confirm details" fullWidth loading={confirmMutation.isPending} onPress={() => void handleConfirm()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
