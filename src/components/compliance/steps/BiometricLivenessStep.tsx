import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { useLivenessResult } from "../../../hooks/useLivenessResult";
import { useOrganization } from "../../../state/OrganizationContext";
import type { ComplianceStep } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { spacing } from "../../ui/theme";
import { ProviderUnavailableState } from "../document-capture/ProviderUnavailableState";
import { LivenessCaptureFlow } from "../liveness/LivenessCaptureFlow";
import { livenessVerdictCopy } from "../liveness/livenessCopy";
import { DevelopmentStepSimulator } from "./DevelopmentStepSimulator";
import { styles } from "./styles";
import type { StepDetailProps } from "./types";

/**
 * The real AWS Rekognition Face Liveness flow (Phase 9E.2) drives this step
 * ONLY when the server-authoritative signal (same Phase 9C.2a/9D.3 contract
 * every other real capture flow uses) says it's actually reachable:
 * `configured_provider === "aws_rekognition"` AND `provider_actionable ===
 * true`. Never a client-side guess about an unconfigured/null provider,
 * and this app never chooses or assumes a provider itself.
 *
 * Unlike identity_document/face_match, biometric_liveness needs no sibling
 * step lookup and no Evidence upload at all -- the entire flow is a
 * session (POST liveness-session) + temporary credentials (POST
 * liveness-session/credentials) + a native capture component + a result
 * poll (GET liveness-result), all scoped directly to this step's own id.
 */
export function BiometricLivenessStep({ step, attempt, isPending }: StepDetailProps) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const isAwsActionable = step.configured_provider === "aws_rekognition" && step.provider_actionable;
  // Only queried when the AWS flow is actually reachable -- a step routed
  // elsewhere (or not actionable) never has a real liveness session to
  // poll for (LivenessProcessingService's own gate refuses to even create
  // one).
  const resultQuery = useLivenessResult(isAwsActionable ? step.id : undefined);

  function handleCheckAgain() {
    void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", activeOrganization?.id] });
  }

  return (
    <View>
      {renderBody(step, isAwsActionable, resultQuery.data, resultQuery.isPending, activeOrganization?.id, handleCheckAgain)}
      <DevelopmentStepSimulator step={step} attempt={attempt} isPending={isPending} />
    </View>
  );
}

function renderBody(
  step: ComplianceStep,
  isAwsActionable: boolean,
  result: ReturnType<typeof useLivenessResult>["data"],
  resultLoading: boolean,
  organizationId: string | undefined,
  onCheckAgain: () => void,
) {
  if (step.status === "passed") {
    if (result?.verdict === "review") {
      const copy = livenessVerdictCopy("review");
      return (
        <View style={localStyles.stateGroup}>
          <Badge label={copy.label} tone={copy.tone} />
          <Text style={styles.description}>{copy.description}</Text>
        </View>
      );
    }
    // Never "Identity verified" -- a liveness pass alone never means that
    // (Phase 9E.2's explicit product-semantics requirement; see
    // livenessCopy.ts's docblock for the full reasoning). Liveness only
    // confirms presence; biometric assurance requires a backend
    // combination with Face Match.
    return <Text style={styles.description}>Your liveness check was completed.</Text>;
  }

  if (!isAwsActionable) {
    if (step.configured_provider === "incode" && step.status === "failed") {
      return <Text style={styles.description}>Your liveness check couldn&apos;t be completed.</Text>;
    }
    return (
      <ProviderUnavailableState
        configuredProvider={step.configured_provider}
        reason={step.provider_unavailable_reason}
        featureLabel="Liveness verification"
        onCheckAgain={onCheckAgain}
        checking={false}
      />
    );
  }

  // Keying by organization forces a full remount (and therefore a full
  // local-state reset, including any in-flight credentials held only in
  // LivenessCaptureFlow's own local state) on every org switch -- no Org A
  // session/credentials/result can ever remain visible after switching
  // (Phase 9E.2's explicit tenant-isolation requirement).
  return <LivenessCaptureFlow key={organizationId} stepId={step.id} result={result} resultLoading={resultLoading} />;
}

const localStyles = StyleSheet.create({
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
});
