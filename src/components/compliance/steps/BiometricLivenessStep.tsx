import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * Backed by App\Modules\Identity\Verification\Contracts\BiometricVerificationProvider,
 * currently bound only to a Fake implementation -- no real vendor (e.g.
 * Incode) is integrated, and no camera/liveness capture endpoint is exposed
 * over HTTP yet. Never stores a biometric template on-device; only a
 * pass/fail outcome and confidence score ever exist server-side. A future
 * real capture flow belongs entirely in this file, behind this same
 * contract-shaped seam.
 */
export function BiometricLivenessStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your liveness check passed.";
  if (step.status === "failed") return "Your liveness check didn't pass.";
  return "Liveness verification isn't available in this app version yet.";
}
