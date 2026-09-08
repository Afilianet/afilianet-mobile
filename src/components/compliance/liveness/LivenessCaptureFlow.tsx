import { AwsFaceLivenessView, type AwsFaceLivenessErrorCode } from "aws-face-liveness";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import { useAbandonLivenessSession } from "../../../hooks/useAbandonLivenessSession";
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
 * EXPLICIT STATE MACHINE (fixes a real physical-device bug -- see git
 * history for the full incident: two real AWS Rekognition sessions were
 * created and both expired unused after ~3 minutes, `failure_reason:
 * session_expired`, because the native view never actually mounted):
 *
 *   idle -> creating_session -> fetching_credentials -> native_capture -> awaiting_result -> (idle, on retry)
 *
 * `ready_for_native_capture` and `native_capture_active` collapse into the
 * single `native_capture` stage -- once session+credentials exist,
 * `AwsFaceLivenessView` mounts and the native SDK owns the entire capture
 * UI itself with no JS-observable "ready but not yet active" moment (see
 * modules/aws-face-liveness's native source: it presents the AWS detector
 * as soon as it has non-empty session/credential props). Likewise
 * `native_capture_completed` and `result_processing` collapse into
 * `awaiting_result` -- the instant onComplete fires there is nothing left
 * to distinguish "just completed" from "now polling"; both are "trust the
 * backend result query from here on".
 *
 * THE BUG THIS FIXES: `useCreateLivenessSession`'s onSuccess seeds the
 * shared liveness-result query cache with the brand new session
 * (`status: "pending"`) the INSTANT session creation resolves -- before
 * credentials are even fetched. The previous version of this component
 * checked that shared `result` prop's pending/processing status
 * UNCONDITIONALLY, before ever checking whether a native capture should be
 * mounted, so it started rendering `LivenessProcessingState` (a "backend is
 * reviewing your check" placeholder) immediately after session creation --
 * permanently, since that check ran on every subsequent render too, no
 * matter that credentials then resolved and `AwsFaceLivenessView` was ready
 * to mount. `StartFaceLivenessSession` never ran on the native side; the
 * real AWS session simply sat idle until its own 3-minute TTL and expired.
 * The fix: `result`/`effectiveResult` is now ONLY consulted while `stage`
 * is "idle" (resuming a pre-existing session/result from before this
 * component instance called handleStart -- e.g. reopening the screen mid-
 * session) or "awaiting_result" (after native capture has genuinely
 * finished) -- never while creating_session/fetching_credentials/
 * native_capture are in progress locally.
 *
 * ABANDON ON ERROR/CANCELLATION: a native onError or user cancellation
 * calls the backend's `.../liveness-session/abandon` endpoint (marks the
 * session terminally `failed`/`client_abandoned`) so the NEXT
 * createLivenessSession() call issues a genuinely fresh AWS session rather
 * than reusing the same still-time-valid one for the rest of its TTL. This
 * call is deliberately fire-and-forget (see useAbandonLivenessSession's
 * docblock) -- the UI recovers to a retryable Retry state immediately via
 * its own local dismissal of the exited session id, regardless of whether
 * the backend call itself succeeds, so a failed abandon can never freeze
 * the UI or block a retry (it only means the old AWS session may stay
 * reachable server-side until its natural TTL instead of being cut short).
 *
 * CREDENTIAL SECRECY (Phase 9E.2's explicit requirement, unchanged):
 * temporary AWS credentials exist ONLY in this component's own local
 * `stage` state, for exactly the span between a successful credentials
 * fetch and the native view reporting completion/error/unmount -- never in
 * a query cache (see useLivenessCredentials.ts), never logged, never sent
 * to analytics. Replacing `stage` (never mutating it) on every transition
 * means nothing keeps referencing a past stage's credentials once it's
 * superseded.
 */
type LivenessCaptureStage =
  | { kind: "idle" }
  | { kind: "creating_session" }
  | { kind: "fetching_credentials"; session: LivenessSession }
  | { kind: "native_capture"; session: LivenessSession; credentials: LivenessCredentials }
  | { kind: "awaiting_result" };

export function LivenessCaptureFlow({
  stepId,
  result,
  resultLoading,
}: {
  stepId: string;
  result: LivenessSession | null | undefined;
  resultLoading: boolean;
}) {
  const [stage, setStage] = useState<LivenessCaptureStage>({ kind: "idle" });
  const [dismissedResultId, setDismissedResultId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const createSession = useCreateLivenessSession(stepId);
  const { fetchCredentials } = useLivenessCredentials(stepId);
  const { abandon } = useAbandonLivenessSession(stepId);
  // A ref, not state -- guards against a rapid double/triple tap starting
  // two session-creation+credentials sequences in the same event-loop
  // tick, before React has even re-rendered with stage.kind !== "idle"
  // (same real-world lesson Phase 9D.3's Face Match guard fixed: a
  // re-render is never synchronous with the tap that started it). Backend
  // session creation is itself idempotent (a duplicate call just reuses
  // the same session), so this guard is a courtesy against wasted STS
  // credential mints, not a correctness requirement on its own.
  const startingRef = useRef(false);

  const isStarting = stage.kind === "creating_session" || stage.kind === "fetching_credentials";
  const effectiveResult = result && result.id === dismissedResultId ? null : result;

  function handleRetry() {
    if (result) {
      setDismissedResultId(result.id);
    }
    setStartError(null);
    setStage({ kind: "idle" });
  }

  async function handleStart() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartError(null);
    setStage({ kind: "creating_session" });
    try {
      const session = await createSession.mutateAsync();
      setStage({ kind: "fetching_credentials", session });
      const credentials = await fetchCredentials();
      setStage({ kind: "native_capture", session, credentials });
    } catch (error) {
      setStage({ kind: "idle" });
      setStartError(isApiError(error) ? friendlyMessage(error) : "Something went wrong. Please try again.");
    } finally {
      startingRef.current = false;
    }
  }

  function handleNativeComplete() {
    // No step id or session detail -- matches this app's zero-property
    // analytics convention for compliance events.
    analytics.capture("liveness_capture_completed");
    setStage({ kind: "awaiting_result" });
  }

  function handleNativeError(code: AwsFaceLivenessErrorCode) {
    if (stage.kind === "native_capture") {
      // Dismissed LOCALLY and unconditionally -- guarantees the UI recovers
      // to a retryable state even if the abandon call below fails, is slow,
      // or the device is offline. This is what actually prevents the stale
      // session's own "pending" status from reappearing and re-triggering
      // this exact bug the moment the next poll tick lands.
      setDismissedResultId(stage.session.id);
      void abandon().catch(() => {
        // Best-effort only -- see useAbandonLivenessSession's docblock.
        // Never surfaced to the user: this app never claims the session
        // was successfully ended when it might not have been, and the
        // local dismissal above already makes the UI fully recoverable
        // regardless of this outcome.
      });
    }
    setStage({ kind: "idle" });
    // A user-initiated cancellation leaves Compliance state exactly as it
    // was and shows no error at all (Phase 9E.2's explicit requirement) --
    // the affiliate simply lands back on the start screen, free to restart.
    if (code === "cancelled") return;
    setStartError(livenessNativeErrorCopy(code));
  }

  if (resultLoading && result === undefined) {
    return <SkeletonGroup lines={3} />;
  }

  if (stage.kind === "native_capture") {
    return (
      <AwsFaceLivenessView
        style={styles.nativeView}
        sessionId={stage.session.session_id}
        region={stage.session.region}
        accessKeyId={stage.credentials.access_key_id}
        secretAccessKey={stage.credentials.secret_access_key}
        sessionToken={stage.credentials.session_token}
        expiration={stage.credentials.expiration}
        onComplete={handleNativeComplete}
        onError={(event) => handleNativeError(event.nativeEvent.code)}
      />
    );
  }

  if (stage.kind === "awaiting_result") {
    if (effectiveResult && (effectiveResult.status === "completed" || effectiveResult.status === "failed")) {
      return <LivenessResultView result={effectiveResult} onRetry={handleRetry} retrying={createSession.isPending} />;
    }
    // Covers both "pending" (backend hasn't picked this up yet) and the
    // brief gap before the first poll tick reflects the just-completed
    // native capture (effectiveResult still stale/undefined here) --
    // either way, native capture is genuinely over, so this is real
    // backend-processing time, never "still recording".
    return <LivenessProcessingState status={effectiveResult?.status === "pending" ? "pending" : "processing"} />;
  }

  // stage is "idle", "creating_session", or "fetching_credentials" here --
  // only trust `effectiveResult`'s pending/processing/result status at
  // genuine idle (resuming state from BEFORE this component instance ever
  // called handleStart -- e.g. reopening the screen mid-session, or a
  // prior attempt's terminal result). Deliberately skipped while starting:
  // useCreateLivenessSession's onSuccess seeds this same query with the
  // brand new session (status "pending") the instant session creation
  // resolves, before credentials are even fetched -- exactly the render-
  // order bug this state machine closes.
  if (!isStarting) {
    if (effectiveResult && (effectiveResult.status === "pending" || effectiveResult.status === "processing")) {
      return <LivenessProcessingState status={effectiveResult.status} />;
    }
    if (effectiveResult && (effectiveResult.status === "completed" || effectiveResult.status === "failed")) {
      return <LivenessResultView result={effectiveResult} onRetry={handleRetry} retrying={createSession.isPending} />;
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.description}>{LIVENESS_EXPLANATION}</Text>
      {startError ? <Text style={styles.error}>{startError}</Text> : null}
      <Button label="Start check" onPress={() => void handleStart()} loading={isStarting} />
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
