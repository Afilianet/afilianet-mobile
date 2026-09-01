import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useTriggerDocumentProcessing } from "../../../hooks/useTriggerDocumentProcessing";
import { analytics } from "../../../services/analytics";
import type { DocumentProcessingResult, DocumentType, Evidence, EvidenceType } from "../../../types/api";
import { spacing } from "../../ui/theme";
import { SkeletonGroup } from "../../Skeleton";
import { CaptureScreen } from "./CaptureScreen";
import { DocumentResultView } from "./DocumentResultView";
import { DocumentTypeSelector } from "./DocumentTypeSelector";
import { EvidenceChecklist } from "./EvidenceChecklist";
import { ProcessingState } from "./ProcessingState";

/**
 * Owns the full capture -> upload -> trigger -> poll -> result state
 * machine for one identity_document step. `result`/`resultLoading` come
 * from the parent's useDocumentResult (shared so IdentityDocumentStep can
 * also read verdict-aware copy for an already-passed step) -- this
 * component never fetches the result itself, only reacts to it.
 *
 * Which evidence has been uploaded THIS session is tracked in local state
 * only -- afilianet-api has no endpoint to list previously-uploaded
 * evidence for a step (Phase 9B deliberately built no read/list access, see
 * EVIDENCE_INFRASTRUCTURE.md section M), so reopening this screen after
 * uploading only part of a document restarts the checklist from scratch.
 * This is a known, reported backend gap (see this phase's report), not a
 * bug in this component -- no functional harm results (a fresh Evidence row
 * simply supersedes the unused earlier one by recency, per the documented
 * retry semantics), just a UX inefficiency.
 */
export function DocumentCaptureFlow({
  stepId,
  result,
  resultLoading,
}: {
  stepId: string;
  result: DocumentProcessingResult | null | undefined;
  resultLoading: boolean;
}) {
  // Initialized from an existing result's own document_type when one is
  // already present on mount (e.g. reopening this screen after a prior
  // attempt) -- the result itself already answers "which document was this
  // for," so retrying never needs to re-ask.
  const [documentType, setDocumentType] = useState<DocumentType | null>(() => result?.document_type ?? null);
  const [uploadedEvidence, setUploadedEvidence] = useState<Partial<Record<EvidenceType, Evidence>>>({});
  const [activeCapture, setActiveCapture] = useState<EvidenceType | null>(null);
  const [dismissedResultId, setDismissedResultId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const triggerMutation = useTriggerDocumentProcessing(stepId);

  const effectiveResult = result && result.id === dismissedResultId ? null : result;

  function handleRetry() {
    if (result) {
      setDismissedResultId(result.id);
      setDocumentType(result.document_type);
    }
    setUploadedEvidence({});
    setSubmitError(null);
  }

  function handleUploaded(evidenceType: EvidenceType, evidence: Evidence) {
    setUploadedEvidence((prev) => ({ ...prev, [evidenceType]: evidence }));
    setActiveCapture(null);
  }

  async function handleSubmit() {
    if (!documentType) return;
    setSubmitError(null);
    try {
      await triggerMutation.mutateAsync(documentType);
      // No document type or step id -- matches this app's zero-property
      // analytics convention for compliance events.
      analytics.capture("document_processing_triggered");
    } catch (error) {
      // A 409 (already in progress) is recovered from automatically by the
      // hook itself -- only surface a real error here.
      if (isApiError(error) && error.status === 409) return;
      setSubmitError(isApiError(error) ? friendlyMessage(error) : "Something went wrong. Please try again.");
    }
  }

  if (resultLoading && result === undefined) {
    return <SkeletonGroup lines={3} />;
  }

  if (effectiveResult && (effectiveResult.status === "pending" || effectiveResult.status === "processing")) {
    return <ProcessingState status={effectiveResult.status} />;
  }

  if (effectiveResult && (effectiveResult.status === "completed" || effectiveResult.status === "failed")) {
    return <DocumentResultView result={effectiveResult} onRetry={handleRetry} retrying={triggerMutation.isPending} />;
  }

  if (activeCapture) {
    return (
      <CaptureScreen
        stepId={stepId}
        evidenceType={activeCapture}
        onCancel={() => setActiveCapture(null)}
        onUploaded={handleUploaded}
      />
    );
  }

  if (!documentType) {
    return <DocumentTypeSelector onSelect={setDocumentType} />;
  }

  return (
    <View style={styles.container}>
      <EvidenceChecklist
        documentType={documentType}
        uploaded={uploadedEvidence}
        submitting={triggerMutation.isPending}
        submitError={submitError}
        onCapture={setActiveCapture}
        onSubmit={() => void handleSubmit()}
        onChangeDocumentType={() => {
          setDocumentType(null);
          setUploadedEvidence({});
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
});
