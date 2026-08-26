import { Text, View } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * Same BiometricVerificationProvider contract as BiometricLivenessStep
 * (currently Fake-only). Face matching is entirely provider-driven server-
 * side -- this app never implements facial recognition itself, only
 * displays the outcome the backend already computed. Simulated outcomes
 * only ever flow through DevelopmentStepSimulator below, never a
 * production action.
 */
export function FaceMatchStep({ step, attempt, isPending }: StepDetailProps) {
  return (
    <View>
      <Text style={styles.description}>{describe(step)}</Text>
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your face match check passed.";
  if (step.status === "failed") return "Your face match check didn't pass.";
  return "Face matching isn't available in this app version yet.";
}
