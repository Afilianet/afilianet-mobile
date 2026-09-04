import { StyleSheet, Text, View } from "react-native";
import type { LivenessSession } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { livenessFailureCopy, livenessVerdictCopy } from "./livenessCopy";

/**
 * Read-only, normalized-fields-only display of the latest liveness
 * session -- never shows a confidence score, threshold, review band, or any
 * other AWS/Rekognition internal (not even present in LivenessSession, see
 * that type's docblock in types/api.ts).
 *
 * PRODUCT SEMANTICS (Phase 9E.2's explicit scope): a `live` verdict means
 * ONLY "a real person appears to be present in front of the camera." It
 * does NOT mean identity verification, document verification, or fraud
 * ruled out -- this view never says "Identity verified", always "Liveness
 * check completed" or equivalent (see livenessCopy.ts). Biometric
 * assurance is a backend-side combination of this AND Face Match's own
 * separate verdict -- never something this screen claims on its own.
 *
 * RETRY DISCIPLINE -- mirrors afilianet-api's own state machine, never
 * invented client-side:
 * - `not_live` (a completed, genuinely-run session that concluded no real
 *   person was confirmed present) leaves the ComplianceStep unresolved
 *   (`failed`) -- retryable, so a "Try again" button is offered.
 * - `live`/`review` both resolve the ComplianceStep (`passed`) -- the
 *   backend then refuses a further session-eligible action naturally (a
 *   completed step has nothing further to do), so no retry action is ever
 *   offered for either.
 * - A TECHNICAL failure (`status: "failed"`, no verdict at all) never
 *   resolves the step and is always retryable (see livenessCopy.ts's
 *   docblock: no backend-enforced max-attempts limit exists for any of
 *   these categories, including session_expired) -- retrying always means
 *   the exact same action (create a fresh session), never a
 *   distinguishable "resume" vs. "restart" choice.
 */
export function LivenessResultView({
  result,
  onRetry,
  retrying,
}: {
  result: LivenessSession;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (result.status === "failed") {
    const failure = livenessFailureCopy(result.failure_reason);
    return (
      <View style={styles.container}>
        <Badge label="Couldn't complete" tone="danger" />
        <Text style={styles.description}>{failure.message}</Text>
        {failure.retryable ? <Button label="Try again" onPress={onRetry} loading={retrying} /> : null}
      </View>
    );
  }

  const copy = livenessVerdictCopy(result.verdict);

  return (
    <View style={styles.container}>
      <Badge label={copy.label} tone={copy.tone} />
      {copy.description ? <Text style={styles.description}>{copy.description}</Text> : null}
      {result.verdict === "not_live" ? <Button label="Try again" onPress={onRetry} loading={retrying} /> : null}
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
