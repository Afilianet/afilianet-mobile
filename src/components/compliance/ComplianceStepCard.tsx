import type { ComponentType } from "react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../api/errors";
import { complianceStepStatusCopy } from "../../design-system/statusMapping";
import { useAttemptComplianceStep } from "../../hooks/useAttemptComplianceStep";
import type { AttemptStepPayload, ComplianceStep, ComplianceStepType } from "../../types/api";
import { formatDate } from "../../utils/date";
import { Badge } from "../ui/Badge";
import { colors, spacing, typography } from "../ui/theme";
import { BiometricLivenessStep } from "./steps/BiometricLivenessStep";
import { FaceMatchStep } from "./steps/FaceMatchStep";
import { IdentityDocumentStep } from "./steps/IdentityDocumentStep";
import { IdentityInformationStep } from "./steps/IdentityInformationStep";
import { TermsAcceptanceStep } from "./steps/TermsAcceptanceStep";
import type { StepDetailProps } from "./steps/types";
import { VerbalConsentStep } from "./steps/VerbalConsentStep";

const STEP_LABELS: Record<ComplianceStepType, string> = {
  identity_information: "Identity information",
  identity_document: "Identity document",
  biometric_liveness: "Liveness check",
  face_match: "Face match",
  verbal_consent: "Verbal consent",
  terms_acceptance: "Terms acceptance",
};

// The only place the step_type -> vendor-specific UI mapping happens. The
// overview screen and this card only ever know "here is a step and its
// status" -- swapping a Fake flow for a real one is a change to one of
// these components, never to this dispatch table's callers.
const STEP_COMPONENTS: Record<ComplianceStepType, ComponentType<StepDetailProps>> = {
  identity_information: IdentityInformationStep,
  identity_document: IdentityDocumentStep,
  biometric_liveness: BiometricLivenessStep,
  face_match: FaceMatchStep,
  verbal_consent: VerbalConsentStep,
  terms_acceptance: TermsAcceptanceStep,
};

export function ComplianceStepCard({ step }: { step: ComplianceStep }) {
  const mutation = useAttemptComplianceStep();
  const [error, setError] = useState<string | null>(null);

  async function attempt(payload: AttemptStepPayload) {
    setError(null);
    try {
      await mutation.mutateAsync({ stepId: step.id, payload });
    } catch (submitError) {
      setError(isApiError(submitError) ? friendlyMessage(submitError) : "Something went wrong. Please try again.");
    }
  }

  const status = complianceStepStatusCopy(step.status);
  const label = STEP_LABELS[step.step_type] ?? step.step_type.replace(/_/g, " ");
  const StepDetail = STEP_COMPONENTS[step.step_type];

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}, ${status.label}${step.completed_at ? `, completed ${formatDate(step.completed_at)}` : ""}`}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      {StepDetail ? <StepDetail step={step} attempt={(payload) => void attempt(payload)} isPending={mutation.isPending} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {step.completed_at ? <Text style={styles.meta}>Completed {formatDate(step.completed_at)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 44,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
