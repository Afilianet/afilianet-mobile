import { Alert, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
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
    return <Text style={sharedStyles.description}>{strings.compliance.terms.acceptedText}</Text>;
  }
  if (step.status === "failed") {
    return <Text style={sharedStyles.description}>{strings.compliance.terms.failedText}</Text>;
  }

  function confirm() {
    analytics.capture("compliance_step_opened");
    Alert.alert(strings.compliance.terms.alertTitle, strings.compliance.terms.alertMessage, [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.compliance.terms.alertAccept,
        onPress: () => {
          analytics.capture("compliance_step_submitted");
          attempt({ accepted: true });
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={sharedStyles.description}>{strings.compliance.terms.bodyText}</Text>
      <Button label={strings.compliance.terms.acceptButton} variant="secondary" size="sm" loading={isPending} onPress={confirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
});
