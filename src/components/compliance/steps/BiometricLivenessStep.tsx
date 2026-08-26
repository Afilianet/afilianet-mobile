import { Text, View } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * Backed by App\Modules\Identity\Verification\Contracts\BiometricVerificationProvider,
 * currently bound only to a Fake implementation -- no real vendor (e.g.
 * Incode) is integrated. Never stores a biometric template on-device; only
 * a pass/fail outcome and confidence score ever exist server-side, and the
 * only place this app is allowed to send a simulated outcome is
 * DevelopmentStepSimulator below, never a production action. A future real
 * capture flow belongs entirely in this file, behind this same
 * contract-shaped seam.
 */
export function BiometricLivenessStep({ step, attempt, isPending }: StepDetailProps) {
  return (
    <View>
      <Text style={styles.description}>{describe(step)}</Text>
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your liveness check passed.";
  if (step.status === "failed") return "Your liveness check didn't pass.";
  return "Liveness verification isn't available in this app version yet.";
}
