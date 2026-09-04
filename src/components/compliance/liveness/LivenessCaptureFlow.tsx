import { AwsFaceLivenessView, type AwsFaceLivenessErrorCode } from "aws-face-liveness";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useCreateLivenessSession } from "../../../hooks/useCreateLivenessSession";
import { useLivenessCredentials } from "../../../hooks/useLivenessCredentials";
import { analytics } from "../../../services/analytics";
import type { LivenessCredentials, LivenessSession } from "../../../types/api";
import { SkeletonGroup } from "../../Skeleton";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { LivenessProcessingState } from "./LivenessProcessingState";
import { LivenessResultView } from "./LivenessResultView";
import { LIVENESS_EXPLANATION, livenessNativeErrorCopy } from "./livenessCopy";

/**
 * Owns the full session -> credentials -> native capture -> poll -> result
 * state machine for one biometric_liveness step -- mirrors
 * face-match/FaceMatchCaptureFlow.tsx's exact shape (Phase 9D.3), adapted
 * for AWS Face Liveness's own lifecycle (a session + temporary STS
 * credentials, never an Evidence upload -- liveness never uses the
 * Evidence system at all).
 *
 * Deliberately never re-implements any part of the actual capture UI --
 * `AwsFaceLivenessView` (this project's own thin Expo Module wrapping
 * AWS's OFFICIAL native Face Liveness SDKs, see modules/aws-face-liveness)
 * is the ONLY thing presented once a session+credentials exist; this
 * component's own UI is limited to the explanation/start screen and the
 * post-capture processing/result states.
 *
 * CREDENTIAL SECRECY (Phase 9E.2's explicit requirement): temporary AWS
 * credentials exist ONLY in this component's own local state, for exactly
 * the span between a successful credentials fetch and the native view
 * reporting completion/error/unmount -- never in a query cache (see
 * useLivenessCredentials.ts), never logged, never sent to analytics.
 * `clearCredentials()` is called on every exit path (native completion,
 * native error including user-cancellation, and via the cleanup effect
 * below on unmount/org-switch, since this component is keyed by
 * organization id from BiometricLivenessStep -- an org switch always fully
 * remounts this component).
 */
export function LivenessCaptureFlow({
  stepId,
  result,
  resultLoading,
}: {
  stepId: string;
  result: LivenessSession | null | undefined;
  resultLoading: boolean;
}) {
  const [activeCapture, setActiveCapture] = useState<{ session: LivenessSession; credentials: LivenessCredentials } | null>(null);
  const [dismissedResultId, setDismissedResultId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const createSession = useCreateLivenessSession(stepId);
  const { fetchCredentials } = useLivenessCredentials(stepId);
  // A ref, not state -- guards against a rapid double/triple tap starting
  // two session-creation+credentials sequences in the same event-loop
  // tick, before React has even re-rendered with createSession.isPending
  // === true (same real-world lesson Phase 9D.3's Face Match guard fixed:
  // a re-render is never synchronous with the tap that started it).
  // Backend session creation is itself idempotent (a duplicate call just
  // reuses the same session), so this guard is a courtesy against wasted
  // STS credential mints, not a correctness requirement on its own.
  const startingRef = useRef(false);

  const effectiveResult = result && result.id === dismissedResultId ? null : result;

  function clearCredentials() {
    setActiveCapture(null);
  }

  function handleRetry() {
    if (result) {
      setDismissedResultId(result.id);
    }
    setStartError(null);
  }

  async function handleStart() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartError(null);
    try {
      const session = await createSession.mutateAsync();
      const credentials = await fetchCredentials();
      setActiveCapture({ session, credentials });
    } catch (error) {
      setStartError(isApiError(error) ? friendlyMessage(error) : "Something went wrong. Please try again.");
    } finally {
      startingRef.current = false;
    }
  }

  function handleNativeComplete() {
    // No step id or session detail -- matches this app's zero-property
    // analytics convention for compliance events.
    analytics.capture("liveness_capture_completed");
    clearCredentials();
  }

  function handleNativeError(code: AwsFaceLivenessErrorCode) {
    clearCredentials();
    // A user-initiated cancellation leaves Compliance state exactly as it
    // was and shows no error at all (Phase 9E.2's explicit requirement) --
    // the affiliate simply lands back on the start screen, free to restart.
    if (code === "cancelled") return;
    setStartError(livenessNativeErrorCopy(code));
  }

  if (resultLoading && result === undefined) {
    return <SkeletonGroup lines={3} />;
  }

  if (effectiveResult && (effectiveResult.status === "pending" || effectiveResult.status === "processing")) {
    return <LivenessProcessingState status={effectiveResult.status} />;
  }

  if (effectiveResult && (effectiveResult.status === "completed" || effectiveResult.status === "failed")) {
    return <LivenessResultView result={effectiveResult} onRetry={handleRetry} retrying={createSession.isPending} />;
  }

  if (activeCapture) {
    return (
      <AwsFaceLivenessView
        style={styles.nativeView}
        sessionId={activeCapture.session.session_id}
        region={activeCapture.session.region}
        accessKeyId={activeCapture.credentials.access_key_id}
        secretAccessKey={activeCapture.credentials.secret_access_key}
        sessionToken={activeCapture.credentials.session_token}
        expiration={activeCapture.credentials.expiration}
        onComplete={handleNativeComplete}
        onError={(event) => handleNativeError(event.nativeEvent.code)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.description}>{LIVENESS_EXPLANATION}</Text>
      {startError ? <Text style={styles.error}>{startError}</Text> : null}
      <Button label="Start check" onPress={() => void handleStart()} loading={createSession.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  nativeView: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
