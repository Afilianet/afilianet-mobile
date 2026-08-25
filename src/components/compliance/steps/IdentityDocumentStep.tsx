import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * Evidence for this step is metadata-only in afilianet-api today --
 * Evidence.storage_provider/storage_key are a reference to wherever the
 * real bytes eventually live (S3 or similar); no such integration exists
 * yet, and no binary is ever stored in Postgres. There's also no HTTP
 * endpoint to submit this step at all. A future real document-capture +
 * upload flow belongs entirely in this file.
 */
export function IdentityDocumentStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your identity document was verified.";
  if (step.status === "failed") return "Your identity document couldn't be verified.";
  return "Document upload isn't available in this app version yet.";
}
