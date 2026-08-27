import { Alert, StyleSheet, Text, View } from "react-native";
import { analytics } from "../../../services/analytics";
import { Button } from "../../ui/Button";
import { spacing } from "../../ui/theme";
import { styles as sharedStyles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The only compliance step type that's genuinely real production
 * functionality today -- ComplianceService::runProvider() records
 * acceptance locally with no external/Fake provider involved at all
 * (unlike identity_document/biometric_liveness/face_match/verbal_consent,
 * which are Fake-provider simulations only). But afilianet-api has no
 * versioned Terms/consent-document model yet, so there is no real terms
 * text or version reference to show -- never invent one. The disclosure
 * below and the confirmation before submitting both exist so an affiliate
 * is never misled into thinking they reviewed real legal terms. A future
 * terms version/reference (e.g. `step.metadata.terms_version`) is a small,
 * additive change to `describe()`/the confirm copy below, not a rearchitect.
 */
export function TermsAcceptanceStep({ step, attempt, isPending }: StepDetailProps) {
  if (step.status === "passed") {
    return <Text style={sharedStyles.description}>You&apos;ve accepted the required terms.</Text>;
  }
  if (step.status === "failed") {
    return <Text style={sharedStyles.description}>Your terms acceptance couldn&apos;t be recorded.</Text>;
  }

  function confirm() {
    analytics.capture("compliance_step_opened");
    Alert.alert(
      "Accept terms?",
      "This organization hasn't published a reviewable terms document yet. Accepting now records your acceptance -- you'll be asked to review the full terms once they're published.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: () => {
            analytics.capture("compliance_step_submitted");
            attempt({ accepted: true });
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Text style={sharedStyles.description}>
        A terms document hasn&apos;t been published for this organization yet. Accepting now records your
        acceptance; you&apos;ll be asked to review the full terms once they&apos;re available.
      </Text>
      <Button label="Accept terms" variant="secondary" size="sm" loading={isPending} onPress={confirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
});
