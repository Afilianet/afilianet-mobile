import { Alert, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import { analytics } from "../../../services/analytics";
import { useAssistedComplianceId, useAssistedPersonName } from "../../../state/ComplianceScopeContext";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { styles as sharedStyles } from "./styles";
import type { TermsAcceptedVia } from "../../../types/api";
import type { StepDetailProps } from "./types";

/**
 * The KYC terms step (API A5, docs/identity/KYC_TERMS_ACCEPTANCE.md in
 * afilianet-api). The API serves the approved, published document on the
 * step (`terms_document`); the app shows it in full and the acceptance names
 * exactly that version and hash. Without a document -- none published, or an
 * API before A5 that does not send the field -- there is nothing to accept and
 * no button: an acceptance of nothing is never recorded. A 409 for a changed
 * or withdrawn document reloads the case (useAttemptComplianceStep).
 *
 * Only the person verified accepts, from their own session (API #106): in a
 * sponsor's assisted verification the step says who still has to accept and
 * never offers the button -- also on an API that does not send
 * `requires_own_session` yet, since the server refuses the sponsor anyway.
 * Once accepted, `accepted_via` says from whose session it was done.
 */
export function TermsAcceptanceStep({ step, attempt, isPending }: StepDetailProps) {
  const assisted = Boolean(useAssistedComplianceId());
  const personName = useAssistedPersonName();
  if (step.status === "passed") {
    return <Text style={sharedStyles.description} testID="terms-accepted">{acceptedText(step.accepted_via, assisted)}</Text>;
  }
  if (step.status === "failed") {
    return <Text style={sharedStyles.description}>{strings.compliance.terms.failedText}</Text>;
  }
  if (assisted || step.requires_own_session) {
    return (
      <Text style={sharedStyles.description} testID="terms-requires-own-session">
        {strings.compliance.terms.requiresOwnSession(personName)}
      </Text>
    );
  }
  const document = step.terms_document;
  if (!document) {
    return <Text style={sharedStyles.description} testID="terms-not-published">{strings.compliance.terms.notPublished}</Text>;
  }

  function confirm() {
    if (!document) return;
    analytics.capture("compliance_step_opened");
    Alert.alert(strings.compliance.terms.alertTitle, strings.compliance.terms.alertMessage(document.title, document.version), [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.compliance.terms.alertAccept,
        onPress: () => {
          analytics.capture("compliance_step_submitted");
          attempt({ accepted: true, document_version: document.version, document_sha256: document.content_sha256 });
        },
      },
    ]);
  }

  return (
    <View style={styles.container} testID="terms-document">
      <Text style={styles.title}>{document.title}</Text>
      <Text style={styles.meta}>{strings.compliance.terms.version(document.version)}</Text>
      {document.sections.map((section, index) => (
        <View key={`${index}-${section.title}`} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={sharedStyles.description}>{section.text}</Text>
        </View>
      ))}
      <Button label={strings.compliance.terms.acceptButton} variant="secondary" size="sm" loading={isPending} onPress={confirm} />
    </View>
  );
}

/** The actor is never blurred with the person verified: a record made from a sponsor's session says so. */
function acceptedText(acceptedVia: TermsAcceptedVia | null | undefined, assisted: boolean): string {
  if (acceptedVia === "assisted_enrollment") return strings.compliance.terms.acceptedViaSponsor;
  return assisted ? strings.compliance.terms.acceptedByPerson : strings.compliance.terms.acceptedText;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  section: { gap: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  sectionTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
});
