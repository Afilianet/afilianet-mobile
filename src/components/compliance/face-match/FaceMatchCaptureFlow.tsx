import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { strings } from "../../../i18n";
import { useTriggerFaceMatchProcessing } from "../../../hooks/useTriggerFaceMatchProcessing";
import { analytics } from "../../../services/analytics";
import type { Evidence, FaceMatchProcessingResult } from "../../../types/api";
import { SkeletonGroup } from "../../Skeleton";
import { Button } from "../../ui/Button";
import { Icon } from "../../../design-system/icons/Icon";
import { colors, radius, spacing, typography } from "../../ui/theme";
import { FaceMatchProcessingState } from "./FaceMatchProcessingState";
import { FaceMatchResultView } from "./FaceMatchResultView";
import { SelfieCaptureScreen } from "./SelfieCaptureScreen";

/**
 * Owns the full capture -> upload -> trigger -> poll -> result state
 * machine for one face_match step -- mirrors
 * document-capture/DocumentCaptureFlow.tsx's exact shape (Phase 9C.2),
 * simplified to a SINGLE evidence item (one selfie, never a multi-side
 * checklist like identity_document's front/back).
 *
 * The probe selfie is uploaded directly against `face_match`'s OWN step
 * (Phase 9D.3.1) -- see StepEvidenceCompatibility in afilianet-api. This
 * used to go through the sibling `biometric_liveness` step instead (the
 * only pre-9D.3.1 upload target), which broke a Failed face_match retry
 * once `biometric_liveness` had already passed and become immutable (a
 * real physical-device finding, compliance case #72: the backend rejected
 * the re-upload as "no longer actionable" even though face_match itself
 * was still retryable) -- see SelfieCaptureScreen's docblock.
 *
 * Deliberately never locally checks "has identity_document completed" --
 * that would be exactly the kind of local inference Phase 9D.3 explicitly
 * forbids (see this phase's brief item 3). If the backend's own trigger
 * gate reports the prerequisite is missing (409, a real and distinct
 * FaceMatchProcessingException case from "already in progress"), that
 * surfaces as safe guidance in handleSubmit()'s catch block instead --
 * reacting to the backend's actual signal, never guessing ahead of it.
 */
export function FaceMatchCaptureFlow({
  faceMatchStepId,
  result,
  resultLoading,
}: {
  faceMatchStepId: string;
  result: FaceMatchProcessingResult | null | undefined;
  resultLoading: boolean;
}) {
  const [uploadedSelfie, setUploadedSelfie] = useState<Evidence | null>(null);
  const [activeCapture, setActiveCapture] = useState(false);
  const [dismissedResultId, setDismissedResultId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const triggerMutation = useTriggerFaceMatchProcessing(faceMatchStepId);
  // A ref, not state -- guards against a rapid double/triple tap firing
  // multiple triggers in the same event-loop tick, before React has even
  // re-rendered with triggerMutation.isPending === true (that re-render is
  // never synchronous with the tap that started it). Reset once the
  // request settles either way, so a genuine retry after a real failure is
  // never blocked.
  const submittingRef = useRef(false);

  const effectiveResult = result && result.id === dismissedResultId ? null : result;

  function handleRetry() {
    if (result) {
      setDismissedResultId(result.id);
    }
    setUploadedSelfie(null);
    setSubmitError(null);
  }

  function handleUploaded(evidence: Evidence) {
    setUploadedSelfie(evidence);
    setActiveCapture(false);
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitError(null);
    try {
      await triggerMutation.mutateAsync();
      // No step id or evidence detail -- matches this app's zero-property
      // analytics convention for compliance events.
      analytics.capture("face_match_processing_triggered");
    } catch (error) {
      if (!isApiError(error)) {
        setSubmitError(strings.faceMatch.genericError);
        return;
      }
      // A 409 (already in progress) is recovered from automatically by the
      // hook itself -- only surface a real error here. A 409 with a
      // DIFFERENT message means the identity-document prerequisite isn't
      // met yet (FaceMatchProcessingException::noDocumentPortraitSourceYet()) --
      // genuinely different, user-actionable safe guidance, never silently
      // absorbed.
      if (error.status === 409) {
        if (error.message.includes("already in progress")) return;
        setSubmitError(strings.faceMatch.documentStepNotCompleted);
        return;
      }
      // 503 (FaceMatchProcessingException::faceMatchEngineUnavailable() --
      // the provider gate discovered the engine isn't operationally
      // available right now) is a distinct OPERATIONAL state, never framed
      // as a biometric mismatch -- the selfie already uploaded stays
      // exactly as it is, and the affiliate can simply try again later (a
      // manual retry via the same "Submit for verification" button --
      // never an automatic loop).
      if (error.status === 503) {
        setSubmitError(strings.faceMatch.serviceUnavailable);
        return;
      }
      setSubmitError(friendlyMessage(error));
    } finally {
      submittingRef.current = false;
    }
  }

  if (resultLoading && result === undefined) {
    return <SkeletonGroup lines={3} />;
  }

  if (effectiveResult && (effectiveResult.status === "pending" || effectiveResult.status === "processing")) {
    return <FaceMatchProcessingState status={effectiveResult.status} />;
  }

  if (effectiveResult && (effectiveResult.status === "completed" || effectiveResult.status === "failed")) {
    return <FaceMatchResultView result={effectiveResult} onRetry={handleRetry} retrying={triggerMutation.isPending} />;
  }

  if (activeCapture) {
    return <SelfieCaptureScreen stepId={faceMatchStepId} onCancel={() => setActiveCapture(false)} onUploaded={handleUploaded} />;
  }

  const captured = uploadedSelfie?.status === "uploaded";

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setActiveCapture(true)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`${strings.faceMatch.selfie}, ${captured ? strings.faceMatch.captured : strings.faceMatch.notYetCaptured}`}
        accessibilityHint={captured ? strings.faceMatch.retakeHint : strings.faceMatch.captureHint}
      >
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{strings.faceMatch.selfie}</Text>
          <Text style={[styles.rowStatus, captured ? styles.rowStatusDone : null]}>
            {captured ? strings.faceMatch.captured : strings.faceMatch.notYetCaptured}
          </Text>
        </View>
        <Icon name={captured ? "check" : "reloj"} size={18} color={captured ? colors.success : colors.textTertiary} />
      </Pressable>

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

      <Button
        label={strings.faceMatch.submitForVerification}
        fullWidth
        disabled={!captured}
        loading={triggerMutation.isPending}
        onPress={() => void handleSubmit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
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
