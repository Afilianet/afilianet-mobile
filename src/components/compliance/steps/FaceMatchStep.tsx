import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { useFaceMatchResult } from "../../../hooks/useFaceMatchResult";
import { useOrganization } from "../../../state/OrganizationContext";
import type { ComplianceStep } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { spacing } from "../../ui/theme";
import { ProviderUnavailableState } from "../document-capture/ProviderUnavailableState";
import { FaceMatchCaptureFlow } from "../face-match/FaceMatchCaptureFlow";
import { faceMatchVerdictCopy, isReferenceInconclusive, REFERENCE_INCONCLUSIVE_COPY } from "../face-match/faceMatchCopy";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The real Afilianet face-match flow (Phase 9D.3) drives this step ONLY
 * when the server-authoritative signal (same Phase 9C.2a contract
 * IdentityDocumentStep uses) says it's actually reachable:
 * `configured_provider === "afilianet"` AND `provider_actionable === true`.
 * Never a client-side guess about an unconfigured/null provider, and this
 * app never chooses or assumes a provider itself.
 *
 * Face match's `selfie` evidence is uploaded directly against face_match's
 * own step (Phase 9D.3.1 -- see StepEvidenceCompatibility in afilianet-api)
 * -- no sibling `biometric_liveness` step needs to be resolved for this
 * flow to work.
 */
export function FaceMatchStep({ step, attempt, isPending }: StepDetailProps) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const isAfilianetActionable = step.configured_provider === "afilianet" && step.provider_actionable;
  // Only queried when the Afilianet flow is actually reachable -- a step
  // routed elsewhere (or not actionable) never has a real Afilianet
  // face-match attempt to poll for (FaceMatchProcessingService::trigger()'s
  // gate in afilianet-api refuses to even create one).
  const resultQuery = useFaceMatchResult(isAfilianetActionable ? step.id : undefined);

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
  result: ReturnType<typeof useFaceMatchResult>["data"],
  resultLoading: boolean,
  organizationId: string | undefined,
  onCheckAgain: () => void,
) {
  if (step.status === "passed") {
    if (result?.verdict === "review") {
      const copy = faceMatchVerdictCopy("review");
      return (
        <View style={localStyles.stateGroup}>
          <Badge label={copy.label} tone={copy.tone} />
          <Text style={styles.description}>{copy.description}</Text>
        </View>
      );
    }
    // Phase 9D.4: an ambiguous document reference also resolves this step
    // (`passed`, routing the CASE to manual_review) without ever running a
    // biometric comparison -- `result.verdict` stays null here (never
    // "review", never "match"), so this must be checked BEFORE falling
    // through to the "matched" sentence below, or an inconclusive result
    // would be misrepresented as a real match.
    if (result?.status === "failed" && isReferenceInconclusive(result.failure_reason)) {
      return (
        <View style={localStyles.stateGroup}>
          <Badge label={REFERENCE_INCONCLUSIVE_COPY.label} tone={REFERENCE_INCONCLUSIVE_COPY.tone} />
          <Text style={styles.description}>{REFERENCE_INCONCLUSIVE_COPY.description}</Text>
        </View>
      );
    }
    // Never "Identity verified" -- a face-match pass alone never means
    // that (Phase 9D.3's explicit product-semantics requirement; see
    // faceMatchCopy.ts's docblock for the full reasoning).
    return <Text style={styles.description}>Your face was matched to your identity document.</Text>;
  }

  if (!isAfilianetActionable) {
    if (step.configured_provider === "incode" && step.status === "failed") {
      return <Text style={styles.description}>Your face verification couldn&apos;t be completed.</Text>;
    }
    return (
      <ProviderUnavailableState
        configuredProvider={step.configured_provider}
        reason={step.provider_unavailable_reason}
        featureLabel="Face verification"
        onCheckAgain={onCheckAgain}
        checking={false}
      />
    );
  }

  // Keying by organization forces a full remount (and therefore a full
  // local-state reset) on every org switch -- no in-progress capture
  // selection, uploaded-selfie state, preview image, or result from a
  // previous organization can ever remain visible after switching (Phase
  // 9C.2/9D.3's explicit tenant-isolation requirement).
  return <FaceMatchCaptureFlow key={organizationId} faceMatchStepId={step.id} result={result} resultLoading={resultLoading} />;
}

const localStyles = StyleSheet.create({
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
});
