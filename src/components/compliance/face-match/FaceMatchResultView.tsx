import { StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import type { FaceMatchProcessingResult } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { faceMatchFailureCopy, faceMatchVerdictCopy, isReferenceInconclusive, REFERENCE_INCONCLUSIVE_COPY } from "./faceMatchCopy";

/**
 * Read-only, normalized-fields-only display of the latest face-match
 * attempt -- never shows similarity/distance/threshold/review_band (not
 * even present in FaceMatchProcessingResult, see that type's docblock) or
 * any other engine/model internal.
 *
 * PRODUCT SEMANTICS (Phase 9D.3's explicit scope): a `match` verdict means
 * ONLY "the selfie appears sufficiently similar to the document portrait
 * according to the configured face-comparison engine." It does NOT mean
 * liveness passed, identity is government verified, the document is
 * authentic, or fraud has been ruled out -- this view never says "Identity
 * verified", always "Face matched" or equivalent (see faceMatchVerdictCopy).
 *
 * RETRY DISCIPLINE -- mirrors afilianet-api's own state machine, never
 * invented client-side:
 * - `no_match` (a completed, genuinely-run comparison that concluded the
 *   faces don't match) leaves the ComplianceStep unresolved (`failed`) --
 *   retryable, so a "Retake selfie" button is offered.
 * - `match`/`review` both resolve the ComplianceStep (`passed`) -- the
 *   backend then refuses a further trigger (409, step not actionable), so
 *   NO retry action is ever offered for either, even though `review` is
 *   not yet a final Compliance outcome (see this file's `review` branch:
 *   the affiliate just waits, exactly like a document-processing manual
 *   review -- never repeatedly resubmitting selfies to "escape" review).
 * - A TECHNICAL/capture-quality failure (`status: "failed"`, no verdict at
 *   all) never resolves the step -- always retryable, a REFERENCE-side
 *   failure (the identity document photo, not the selfie, was the
 *   problem) included: the selfie is never blamed for it (see
 *   faceMatchFailureCopy's message), but a "failed, current, actionable"
 *   step must never leave the affiliate with zero clickable action --
 *   identity_document has no recapture action of its own once `passed`,
 *   so withholding the retry here was a real dead end (a confirmed
 *   physical-device bug -- see faceMatchFailureCopy.ts's docblock). The
 *   backend's own trigger() gate is still the authoritative check if the
 *   reference genuinely still can't be used.
 * - EXCEPT `failure_reason: "ambiguous_document_reference"` (Phase 9D.4) --
 *   this one IS resolved server-side (the backend routes it into
 *   Compliance's manual-review pathway, same mechanism as a genuine
 *   biometric `verdict: review`), so by the time the compliance-steps
 *   query catches up this component won't even be reached anymore (see
 *   FaceMatchStep.tsx's `step.status === "passed"` branch) -- but this
 *   check still needs to run HERE too, for the brief window where
 *   useFaceMatchResult's polling already saw the failed result before the
 *   steps query has refetched. Never offers a retry for it (retaking the
 *   selfie cannot change which faces exist in the already-captured,
 *   immutable document image) and never reuses the generic
 *   faceMatchFailureCopy() "check the Identity document step" message,
 *   which implies an action the affiliate can't actually take.
 */
export function FaceMatchResultView({
  result,
  onRetry,
  retrying,
}: {
  result: FaceMatchProcessingResult;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (result.status === "failed" && isReferenceInconclusive(result.failure_reason)) {
    return (
      <View style={styles.container}>
        <Badge label={REFERENCE_INCONCLUSIVE_COPY.label} tone={REFERENCE_INCONCLUSIVE_COPY.tone} />
        <Text style={styles.description}>{REFERENCE_INCONCLUSIVE_COPY.description}</Text>
      </View>
    );
  }

  if (result.status === "failed") {
    const failure = faceMatchFailureCopy(result.failure_reason);
    return (
      <View style={styles.container}>
        <Badge label={strings.faceMatch.couldNotProcess} tone="danger" />
        <Text style={styles.description}>{failure.message}</Text>
        <Button label={strings.faceMatch.retakeSelfie} onPress={onRetry} loading={retrying} />
      </View>
    );
  }

  const copy = faceMatchVerdictCopy(result.verdict);

  return (
    <View style={styles.container}>
      <Badge label={copy.label} tone={copy.tone} />
      {copy.description ? <Text style={styles.description}>{copy.description}</Text> : null}
      {result.verdict === "no_match" ? <Button label={strings.faceMatch.retakeSelfie} onPress={onRetry} loading={retrying} /> : null}
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
});
