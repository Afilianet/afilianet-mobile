import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { useDocumentResult } from "../../../hooks/useDocumentResult";
import { useOrganization } from "../../../state/OrganizationContext";
import type { ComplianceStep } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { spacing } from "../../ui/theme";
import { DocumentCaptureFlow } from "../document-capture/DocumentCaptureFlow";
import { verdictCopy } from "../document-capture/documentCaptureCopy";
import { ProviderUnavailableState } from "../document-capture/ProviderUnavailableState";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The real Afilianet document-capture flow (Phase 9C.2) drives this step
 * ONLY when the server-authoritative signal (Phase 9C.2a) says it's
 * actually reachable: `configured_provider === "afilianet"` AND
 * `provider_actionable === true`. Never `step.provider` (attempt history
 * only -- null until a first attempt exists, so it can never answer "should
 * capture even start" before one), and never a client-side guess about an
 * unconfigured/null provider -- this app must never choose or assume a
 * provider itself, see IDENTITY_PLATFORM_DESIGN.md section B.
 *
 * `configured_provider === "incode"` keeps its own distinct message (a
 * future SDK-driven flow, not "unavailable") -- everything else that isn't
 * actionable Afilianet (unconfigured, Fake, misconfigured, not-yet-
 * implemented) shows the same safe ProviderUnavailableState, reusing
 * `provider_unavailable_reason` for reason-specific copy where the backend
 * provides one.
 */
export function IdentityDocumentStep({ step, attempt, isPending }: StepDetailProps) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const isAfilianetActionable = step.configured_provider === "afilianet" && step.provider_actionable;
  // Only queried when the Afilianet flow is actually reachable -- a step
  // routed elsewhere (or not actionable) never has a real Afilianet
  // document-processing attempt to poll for (DocumentProcessingService::trigger()'s
  // gate in afilianet-api refuses to even create one).
  const resultQuery = useDocumentResult(isAfilianetActionable ? step.id : undefined);

  function handleCheckAgain() {
    void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", activeOrganization?.id] });
  }

  return (
    <View>
      {renderBody(step, isAfilianetActionable, resultQuery.data, resultQuery.isPending, activeOrganization?.id, handleCheckAgain)}
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function renderBody(
  step: ComplianceStep,
  isAfilianetActionable: boolean,
  result: ReturnType<typeof useDocumentResult>["data"],
  resultLoading: boolean,
  organizationId: string | undefined,
  onCheckAgain: () => void,
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

  if (!isAfilianetActionable) {
    if (step.configured_provider === "incode" && step.status === "failed") {
      return <Text style={styles.description}>Your identity document couldn&apos;t be verified.</Text>;
    }
    return (
      <ProviderUnavailableState
        configuredProvider={step.configured_provider}
        reason={step.provider_unavailable_reason}
        onCheckAgain={onCheckAgain}
        checking={false}
      />
    );
  }

  // Keying by organization forces a full remount (and therefore a full
  // local-state reset) on every org switch -- no in-progress capture
  // selection, uploaded-evidence map, preview image, or in-progress
  // confirmation edits from a previous organization can ever remain visible
  // after switching (Phase 9C.2/9C.2a's explicit tenant-isolation
  // requirement).
  return <DocumentCaptureFlow key={organizationId} stepId={step.id} result={result} resultLoading={resultLoading} />;
}

const localStyles = StyleSheet.create({
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
});
