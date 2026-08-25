import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * Same BiometricVerificationProvider contract as BiometricLivenessStep
 * (currently Fake-only). Face matching is entirely provider-driven server-
 * side -- this app never implements facial recognition itself, only
 * displays the outcome the backend already computed.
 */
export function FaceMatchStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your face match check passed.";
  if (step.status === "failed") return "Your face match check didn't pass.";
  return "Face matching isn't available in this app version yet.";
}
