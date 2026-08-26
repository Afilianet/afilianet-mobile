import { Text, View } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * afilianet-api has no camera/video capture, S3 upload, hashing, or
 * speech-to-text pipeline today -- ConsentVerificationProvider is
 * Fake-only. This deliberately does NOT build any of that future
 * pipeline; it only displays whatever outcome already exists server-side.
 * Simulated outcomes only ever flow through DevelopmentStepSimulator
 * below, never a production action. A future real capture flow belongs
 * entirely in this file.
 */
export function VerbalConsentStep({ step, attempt, isPending }: StepDetailProps) {
  return (
    <View>
      <Text style={styles.description}>{describe(step)}</Text>
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your verbal consent was recorded.";
  if (step.status === "failed") return "Your verbal consent couldn't be recorded.";
  return "Verbal consent capture isn't available in this app version yet.";
}
