import { StyleSheet, Text, View } from "react-native";
import { useDocumentResult } from "../../../hooks/useDocumentResult";
import { useOrganization } from "../../../state/OrganizationContext";
import type { ComplianceStep } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { spacing } from "../../ui/theme";
import { DocumentCaptureFlow } from "../document-capture/DocumentCaptureFlow";
import { verdictCopy } from "../document-capture/documentCaptureCopy";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The real Afilianet document-capture flow (Phase 9C.2) drives this step
 * when the organization's identity_document provider is `afilianet` (or
 * unattempted/Fake, see below) -- never when it's `incode`, which will use
 * its own SDK-driven flow in a future phase (this app must never choose a
 * provider itself, see IDENTITY_PLATFORM_DESIGN.md section B).
 *
 * `step.provider` is only ever set AFTER a first attempt
 * (ComplianceService::attemptStep() -- see that method's docblock), so
 * there is no backend signal at all for "which provider is this org
 * configured for" before an affiliate's first attempt, and the
 * document-processing trigger endpoint itself does not check this either
 * -- calling it always runs the Afilianet pipeline regardless of
 * organization configuration. This is a real, reported backend gap (see
 * this phase's report's "exact blockers" section), not a client
 * assumption: the safest available client-side rule is to show the
 * Afilianet flow whenever `provider` is null/"afilianet"/a Fake label, and
 * refuse only when it's explicitly "incode".
 */
export function IdentityDocumentStep({ step, attempt, isPending }: StepDetailProps) {
  const { activeOrganization } = useOrganization();
  const isIncode = step.provider === "incode";
  // Never even queried when the step is routed through Incode -- this flow
  // will never have triggered a real Afilianet attempt for that step, so
  // there's nothing useful to fetch and no reason to make the request.
  const resultQuery = useDocumentResult(isIncode ? undefined : step.id);

  return (
    <View>
      {renderBody(step, isIncode, resultQuery.data, resultQuery.isPending, activeOrganization?.id)}
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function renderBody(
  step: ComplianceStep,
  isIncode: boolean,
  result: ReturnType<typeof useDocumentResult>["data"],
  resultLoading: boolean,
  organizationId: string | undefined,
) {
  if (step.status === "passed") {
    if (result?.verdict === "review") {
      const copy = verdictCopy("review");
      return (
        <View style={localStyles.stateGroup}>
          <Badge label={copy.label} tone={copy.tone} />
          <Text style={styles.description}>{copy.description}</Text>
        </View>
      );
    }
    return <Text style={styles.description}>Your identity document was verified.</Text>;
  }

  if (isIncode) {
    if (step.status === "failed") {
      return <Text style={styles.description}>Your identity document couldn&apos;t be verified.</Text>;
    }
    return <Text style={styles.description}>Document verification for this organization uses a different flow.</Text>;
  }

  // Keying by organization forces a full remount (and therefore a full
  // local-state reset) on every org switch -- no in-progress capture
  // selection, uploaded-evidence map, or preview image from a previous
  // organization can ever remain visible after switching (Phase 9C.2's
  // explicit tenant-isolation requirement).
  return <DocumentCaptureFlow key={organizationId} stepId={step.id} result={result} resultLoading={resultLoading} />;
}

const localStyles = StyleSheet.create({
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
});
