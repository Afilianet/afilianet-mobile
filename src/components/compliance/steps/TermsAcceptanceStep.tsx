import { Alert, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import { analytics } from "../../../services/analytics";
import { useAssistedComplianceId } from "../../../state/ComplianceScopeContext";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { styles as sharedStyles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The KYC terms step (API A5, docs/identity/KYC_TERMS_ACCEPTANCE.md in
 * afilianet-api). The API serves the approved, published document on the
 * step (`terms_document`); the app shows it in full and the acceptance names
 * exactly that version and hash. Without a document -- none published, or an
 * API before A5 that does not send the field -- there is nothing to accept and
 * no button: an acceptance of nothing is never recorded. A 409 for a changed
 * or withdrawn document reloads the case (useAttemptComplianceStep).
 */
export function TermsAcceptanceStep({ step, attempt, isPending }: StepDetailProps) {
  const assisted = Boolean(useAssistedComplianceId());
  if (step.status === "passed") {
    return <Text style={sharedStyles.description}>{strings.compliance.terms.acceptedText}</Text>;
  }
  if (step.status === "failed") {
    return <Text style={sharedStyles.description}>{strings.compliance.terms.failedText}</Text>;
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
      {/* In an assisted verification the sponsor holds the phone: the person verified is the one who accepts. */}
      {assisted ? <Text style={styles.assisted} testID="terms-assisted-note">{strings.compliance.terms.assistedNote}</Text> : null}
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

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  section: { gap: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  sectionTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  assisted: { ...typography.bodyStrong, color: colors.textPrimary },
});
