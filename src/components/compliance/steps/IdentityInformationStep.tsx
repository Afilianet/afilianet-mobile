import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * afilianet-api handles this step type as "self-reported, no external
 * verification" server-side (ComplianceService::runProvider()) -- but
 * there's still no HTTP endpoint to submit it, so this is description-only
 * today. A future real form (collecting name/DOB/address, etc.) belongs
 * entirely in this file; ComplianceStepCard's dispatch and the overview
 * screen never need to change to add one.
 */
export function IdentityInformationStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your basic identity details are on file.";
  if (step.status === "failed") return "Your submitted identity details couldn't be verified.";
  return "Submitting identity details from the app isn't available yet.";
}
