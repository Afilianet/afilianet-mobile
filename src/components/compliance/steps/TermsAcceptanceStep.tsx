import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { strings } from "../../../i18n";
import { analytics } from "../../../services/analytics";
import { useAssistedComplianceId, useAssistedPersonName } from "../../../state/ComplianceScopeContext";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { styles as sharedStyles } from "./styles";
import type { ComplianceStatus, TermsAcceptedVia, TermsDocument } from "../../../types/api";
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
 *
 * A step already passed or skipped without the person's own acceptance (API
 * #109, `needs_own_acceptance`) offers the same document and button again,
 * whatever the case status (often manual_review). Accepting keeps the step
 * passed and the case status as it is: the app says the acceptance was
 * recorded, never that the case will be approved.
 */
export function TermsAcceptanceStep({ step, attempt, isPending, captureAvailable = true, caseStatus }: StepDetailProps) {
  const assisted = Boolean(useAssistedComplianceId());
  const personName = useAssistedPersonName();
  const resolved = step.status === "passed" || step.status === "skipped";
  const needsOwnAcceptance = resolved && step.needs_own_acceptance === true;
  const recordedNow = useRecordedOwnAcceptance(needsOwnAcceptance, step.accepted_via);

  if (resolved && !needsOwnAcceptance) {
    if (recordedNow && !assisted) {
      return <Text style={sharedStyles.description} testID="terms-own-acceptance-recorded">{recordedText(caseStatus)}</Text>;
    }
    if (step.status === "skipped") {
      return <Text style={sharedStyles.description} testID="terms-skipped">{strings.compliance.terms.skippedText}</Text>;
    }
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
  if (needsOwnAcceptance && !captureAvailable) {
    // API #109 answers 503 kyc_unavailable with capture off; no button that cannot work.
    return <Text style={sharedStyles.description} testID="terms-needs-own-unavailable">{strings.compliance.terms.needsOwnAcceptanceUnavailable}</Text>;
  }

  return (
    <View style={styles.container} testID="terms-document">
      {needsOwnAcceptance ? (
        <Text style={sharedStyles.description} testID="terms-needs-own-acceptance">{strings.compliance.terms.needsOwnAcceptance}</Text>
      ) : null}
      <TermsDocumentView document={document} />
      <Button label={strings.compliance.terms.acceptButton} variant="secondary" size="sm" loading={isPending} onPress={() => confirm(document, attempt)} />
    </View>
  );
}

function TermsDocumentView({ document }: { document: TermsDocument }) {
  return (
    <>
      <Text style={styles.title}>{document.title}</Text>
      <Text style={styles.meta}>{strings.compliance.terms.version(document.version)}</Text>
      {document.sections.map((section, index) => (
        <View key={`${index}-${section.title}`} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={sharedStyles.description}>{section.text}</Text>
        </View>
      ))}
    </>
  );
}

function confirm(document: TermsDocument, attempt: StepDetailProps["attempt"]) {
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

/** True once this screen saw the step go from needing the person's own acceptance to having it. */
function useRecordedOwnAcceptance(needsOwnAcceptance: boolean, acceptedVia: TermsAcceptedVia | null | undefined): boolean {
  const previous = useRef(needsOwnAcceptance);
  const [recorded, setRecorded] = useState(false);
  useEffect(() => {
    if (previous.current && !needsOwnAcceptance && acceptedVia === "own_session") setRecorded(true);
    previous.current = needsOwnAcceptance;
  }, [needsOwnAcceptance, acceptedVia]);
  return recorded;
}

/** The case status does not change with the acceptance: in manual review it still waits for the organization. */
function recordedText(caseStatus: ComplianceStatus | undefined): string {
  return caseStatus === "manual_review" ? strings.compliance.terms.ownAcceptanceAwaitingReview : strings.compliance.terms.ownAcceptanceRecorded;
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
