import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useRetryDocumentProcessing } from "../../../hooks/useRetryDocumentProcessing";
import { strings } from "../../../i18n";
import type { DocumentProcessingResult } from "../../../types/api";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { isTechnicalFailureReason } from "./documentCaptureCopy";

/**
 * The identity_document step is already passed with the photos stored
 * (capture_accepted) and the latest engine run failed for a TECHNICAL reason
 * (API #110). The photos are never discarded or uploaded again: the only
 * action re-runs the engine over them, and only while the server says
 * `retry_available` for this reader -- not for a sponsor once the person
 * activated the account, not past the cap. An unusable photo
 * (poor_image_quality and the like) is not a technical failure and never
 * gets this button. While a run started here is in flight it says so.
 */
export function DocumentProcessingRetry({
  stepId,
  result,
  captureAvailable = true,
}: {
  stepId: string;
  result: DocumentProcessingResult;
  /** KYC capture off (API #86): the server answers 503 kyc_unavailable, so no button. */
  captureAvailable?: boolean;
}) {
  const mutation = useRetryDocumentProcessing(stepId);
  const [error, setError] = useState<string | null>(null);
  const [retriedHere, setRetriedHere] = useState(false);
  // A ref, not state: two taps in the same tick both see isPending false.
  const submittingRef = useRef(false);
  const copy = strings.documentCapture.technicalRetry;

  async function handleRetry() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      await mutation.mutateAsync();
      setRetriedHere(true);
    } catch (retryError) {
      setError(retryErrorMessage(retryError));
    } finally {
      submittingRef.current = false;
    }
  }

  if (result.status === "pending" || result.status === "processing") {
    return (
      <Text style={styles.description} testID="document-retry-processing">
        {retriedHere ? copy.processing : strings.documentCapture.captureAcceptedTitle}
      </Text>
    );
  }

  if (result.status !== "failed" || !isTechnicalFailureReason(result.failure_reason)) {
    return <Text style={styles.description}>{strings.documentCapture.captureAcceptedTitle}</Text>;
  }

  if (result.retry_available !== true || !captureAvailable) {
    return (
      <View style={styles.container} testID="document-retry-unavailable">
        <Text style={styles.description}>{copy.notAvailable}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="document-retry">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.description}>{copy.description}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={copy.button} variant="secondary" loading={mutation.isPending} disabled={mutation.isPending} onPress={() => void handleRetry()} />
    </View>
  );
}

function retryErrorMessage(error: unknown): string {
  const copy = strings.documentCapture.technicalRetry;
  if (!isApiError(error)) return strings.documentCapture.genericError;
  switch (error.reason) {
    case "document_processing_in_progress":
      return copy.inProgress;
    case "document_retry_not_available":
      return copy.notAvailableError;
    case "document_retry_limit_reached":
      return copy.limitReached;
    case "assisted_access_claimed":
      return copy.claimed;
    case "document_engine_unavailable":
      return strings.documentCapture.failureReasons.unavailable;
    default:
      return friendlyMessage(error);
  }
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger },
});
