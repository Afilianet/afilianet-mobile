import { StyleSheet, Text, View } from "react-native";
import { isDevelopmentSimulatorEnabled } from "../../../config/env";
import { analytics } from "../../../services/analytics";
import type { ComplianceStep } from "../../../types/api";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import type { StepDetailProps } from "./types";

/**
 * QA-only controls for the four Fake-provider-backed step types
 * (identity_document/biometric_liveness/face_match/verbal_consent). This
 * is the ONLY place in the app allowed to send `outcome`/`score` -- no
 * production UI ever offers a "Pass document"/"Approve face match"-style
 * action, since afilianet-api has no real verification vendor integrated
 * and those values only ever exercise its Fake providers.
 *
 * Gated on isDevelopmentSimulatorEnabled, which itself requires both
 * `__DEV__` (dead-code-eliminated out of a release JS bundle, not just
 * hidden at runtime) and the app's own EXPO_PUBLIC_APP_ENV declaration --
 * returning null here means this renders nothing at all in a real build,
 * never an invisible-but-present button. Also hidden once the step is
 * already resolved (passed/skipped, mirroring ComplianceStep::isResolved())
 * -- afilianet-api rejects an attempt on an already-resolved step with a
 * 422 (ComplianceException::stepAlreadyResolved()), so offering a retry
 * control there would only ever produce a confusing error.
 */
export function DevelopmentStepSimulator({ step, attempt, isPending }: StepDetailProps) {
  if (!isDevelopmentSimulatorEnabled) return null;
  if (isResolved(step)) return null;

  function submit(outcome: "pass" | "fail") {
    analytics.capture("compliance_step_submitted");
    attempt({ outcome, score: outcome === "pass" ? 0.95 : 0.1 });
  }

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel="Development simulator. Not available in production."
    >
      <Text style={styles.title}>Development simulator</Text>
      <Text style={styles.caption}>Not available in production. Simulates the Fake verification provider only.</Text>
      <View style={styles.actions}>
        <Button label="Pass" variant="secondary" size="sm" loading={isPending} onPress={() => submit("pass")} />
        <Button label="Fail" variant="danger" size="sm" loading={isPending} onPress={() => submit("fail")} />
      </View>
    </View>
  );
}

function isResolved(step: ComplianceStep): boolean {
  return step.status === "passed" || step.status === "skipped";
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
  },
  caption: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
