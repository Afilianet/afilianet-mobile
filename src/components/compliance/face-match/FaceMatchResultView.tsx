import { StyleSheet, Text, View } from "react-native";
import type { FaceMatchProcessingResult } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { faceMatchFailureCopy, faceMatchVerdictCopy } from "./faceMatchCopy";

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
 *   all) never resolves the step -- retryable, EXCEPT for a REFERENCE-side
 *   failure (the identity document photo, not the selfie, was the
 *   problem) -- see faceMatchFailureCopy's `offerSelfieRetry`: the selfie
 *   is never blamed for a reference-side problem, and no retake button is
 *   offered for it (retaking the selfie can't fix it).
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
  if (result.status === "failed") {
    const failure = faceMatchFailureCopy(result.failure_reason);
    return (
      <View style={styles.container}>
        <Badge label="Couldn't process" tone="danger" />
        <Text style={styles.description}>{failure.message}</Text>
        {failure.offerSelfieRetry ? <Button label="Retake selfie" onPress={onRetry} loading={retrying} /> : null}
      </View>
    );
  }

  const copy = faceMatchVerdictCopy(result.verdict);

  return (
    <View style={styles.container}>
      <Badge label={copy.label} tone={copy.tone} />
      {copy.description ? <Text style={styles.description}>{copy.description}</Text> : null}
      {result.verdict === "no_match" ? <Button label="Retake selfie" onPress={onRetry} loading={retrying} /> : null}
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
