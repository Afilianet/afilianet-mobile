import { Text } from "react-native";
import type { ComplianceStep } from "../../../types/api";
import { styles } from "./styles";

/**
 * afilianet-api has no Terms/consent-version model -- acceptance is just
 * this one step type, recorded as "locally recorded acceptance, no
 * external provider" when attempted server-side, with no HTTP endpoint to
 * do so and no terms text/version exposed by any resource. Never hardcode
 * legal text here; there is no real contract source to render yet.
 */
export function TermsAcceptanceStep({ step }: { step: ComplianceStep }) {
  return <Text style={styles.description}>{describe(step)}</Text>;
}

function describe(step: ComplianceStep): string {
  if (step.status === "passed") return "You've accepted the required terms.";
  if (step.status === "failed") return "Your terms acceptance couldn't be recorded.";
  return "Accepting terms from the app isn't available yet.";
}
