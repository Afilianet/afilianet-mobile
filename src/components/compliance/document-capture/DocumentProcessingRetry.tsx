import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useRetryDocumentProcessing } from "../../../hooks/useRetryDocumentProcessing";
import { useAssistedComplianceId } from "../../../state/ComplianceScopeContext";
import { strings } from "../../../i18n";
import type { ComplianceStatus, DocumentProcessingResult } from "../../../types/api";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { isTechnicalFailureReason } from "./documentCaptureCopy";

/**
 * The identity_document step is already passed with the photos stored
 * (capture_accepted) and the engine may have failed (API #110). The photos
 * are never discarded or uploaded again: the only action re-runs the engine
 * over them, offered only while the server says `retry_available` for this
 * reader -- it alone decides "technical failure, under the cap, case open,
 * not a sponsor after the person activated the account". An unusable photo
 * never gets it. While a run is pending or processing (one started here or
 * the server's own automatic retry) there is nothing to tap; the remaining
 * tries come from the server's counters, which include its automatic runs.
 * Without a retry nothing is rejected and the case does not change status
 * (API #112): it only reaches the organization's review once the pending
 * steps are completed and it is submitted -- with unpublished terms, not even
 * then. So while it is in_progress the copy says the photos are kept and
 * names the next pending step (shown below on this same screen), never that
 * it already went to review. A sponsor reads the same with «la persona».
 */
export function DocumentProcessingRetry({
  stepId,
  result,
  captureAvailable = true,
  caseStatus,
  currentStep,
}: {
  stepId: string;
  result: DocumentProcessingResult;
  /** KYC capture off (API #86): the server answers 503 kyc_unavailable, so no button. */
  captureAvailable?: boolean;
  caseStatus?: ComplianceStatus;
  currentStep?: string | null;
}) {
  const assisted = Boolean(useAssistedComplianceId());
  const mutation = useRetryDocumentProcessing(stepId);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: two taps in the same tick both see isPending false.
  const submittingRef = useRef(false);
  const copy = strings.documentCapture.technicalRetry;

  async function handleRetry() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch (retryError) {
      setError(retryErrorMessage(retryError, caseStatus, assisted));
    } finally {
      submittingRef.current = false;
    }
  }

  if (result.status === "pending" || result.status === "processing") {
    // A second run on the same capture: the one started here or the server's automatic retry.
    const rerun = (result.executions_used ?? 1) > 1 || mutation.isSuccess;
    return (
      <Text style={styles.description} testID="document-retry-processing">
        {rerun ? copy.processing : strings.documentCapture.captureAcceptedTitle}
      </Text>
    );
  }

  if (result.retry_available === true && captureAvailable) {
    const remaining = result.executions_max !== undefined && result.executions_used !== undefined
      ? Math.max(result.executions_max - result.executions_used, 0)
      : null;
    return (
      <View style={styles.container} testID="document-retry">
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.description}>{copy.description}</Text>
        {remaining !== null ? <Text style={styles.meta}>{copy.remaining(remaining)}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={copy.button} variant="secondary" loading={mutation.isPending} disabled={mutation.isPending} onPress={() => void handleRetry()} />
      </View>
    );
  }

  if (error || (result.status === "failed" && isTechnicalFailureReason(result.failure_reason))) {
    return (
      <View style={styles.container} testID="document-retry-unavailable">
        <Text style={styles.description}>{error ?? exhaustedText(caseStatus, assisted)}</Text>
        {caseStatus === "in_progress" && nextStepLabel(currentStep) ? (
          <Text style={styles.meta} testID="document-retry-next-step">{copy.nextStep(nextStepLabel(currentStep) as string)}</Text>
        ) : null}
      </View>
    );
  }

  return <Text style={styles.description}>{strings.documentCapture.captureAcceptedTitle}</Text>;
}

/** null: nothing to say -- the screen just reads the result again (another run already in flight). */
function exhaustedText(caseStatus: ComplianceStatus | undefined, assisted: boolean): string {
  const copy = strings.documentCapture.technicalRetry;
  if (caseStatus === "in_progress") return assisted ? copy.exhaustedInProgressAssisted : copy.exhaustedInProgress;
  if (caseStatus === "manual_review" || caseStatus === "pending_review") return assisted ? copy.exhaustedInReviewAssisted : copy.exhaustedInReview;
  return assisted ? copy.exhaustedOtherAssisted : copy.exhaustedOther;
}

/** The pending step after the document, by its usual label; null when there is none. */
function nextStepLabel(currentStep: string | null | undefined): string | null {
  if (!currentStep || currentStep === "identity_document") return null;
  return (strings.compliance.stepTypeLabels as Record<string, string>)[currentStep] ?? null;
}

function retryErrorMessage(error: unknown, caseStatus: ComplianceStatus | undefined, assisted: boolean): string | null {
  const copy = strings.documentCapture.technicalRetry;
  if (!isApiError(error)) return strings.documentCapture.genericError;
  switch (error.reason) {
    case "document_processing_in_progress":
      return null;
    case "document_retry_not_available":
      return copy.notAvailableError;
    case "document_retry_limit_reached":
      return exhaustedText(caseStatus, assisted);
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
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.body, color: colors.danger },
});
