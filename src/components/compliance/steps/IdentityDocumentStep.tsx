import { Text, View } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * Evidence for this step is metadata-only in afilianet-api today --
 * Evidence.storage_provider/storage_key are a reference to wherever the
 * real bytes eventually live (S3 or similar); no such integration exists
 * yet, and no binary is ever stored in Postgres. No real verification
 * vendor is integrated either -- only a Fake provider, reachable solely
 * through DevelopmentStepSimulator below, never as a production action. A
 * future real document-capture + upload flow belongs entirely in this file.
 */
export function IdentityDocumentStep({ step, attempt, isPending }: StepDetailProps) {
  return (
    <View>
      <Text style={styles.description}>{describe(step)}</Text>
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your identity document was verified.";
  if (step.status === "failed") return "Your identity document couldn't be verified.";
  return "Document upload isn't available in this app version yet.";
}
