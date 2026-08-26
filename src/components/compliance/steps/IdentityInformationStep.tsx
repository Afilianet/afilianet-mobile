import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The endpoint accepts this step with an empty body (see
 * AttemptComplianceStepRequest -- any field submitted here is rejected),
 * and ComplianceService::runProvider() never reads its payload either
 * ("self-reported, no external verification"). There is nothing meaningful
 * for a form to collect yet, so this stays read-only -- never invent DOB,
 * address, CURP, RFC, or document-number fields the backend doesn't
 * consume. `attempt`/`isPending` are accepted only to keep this
 * component's signature uniform with ComplianceStepCard's dispatch table;
 * a future real form belongs entirely in this file.
 */
export function IdentityInformationStep({ step }: StepDetailProps) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your basic identity details are on file.";
  if (step.status === "failed") return "Your submitted identity details couldn't be verified.";
  return "Submitting identity details from the app isn't available yet.";
}
