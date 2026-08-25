import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * afilianet-api has no camera/video capture, S3 upload, hashing, or
 * speech-to-text pipeline today -- ConsentVerificationProvider is
 * Fake-only and unreachable over HTTP. This deliberately does NOT build
 * any of that future pipeline; it only displays whatever outcome already
 * exists server-side. A future real capture flow belongs entirely in this
 * file.
 */
export function VerbalConsentStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "Your verbal consent was recorded.";
  if (step.status === "failed") return "Your verbal consent couldn't be recorded.";
  return "Verbal consent capture isn't available in this app version yet.";
}
