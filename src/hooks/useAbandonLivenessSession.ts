import { useCallback } from "react";
import { abandonLivenessSession } from "../api/endpoints";
import type { LivenessSession } from "../types/api";

/**
 * Lets the capture flow explicitly give up on the current session (native
 * onError or cancellation) so a subsequent createLivenessSession() issues a
 * genuinely fresh AWS session, instead of its own idempotent reuse check
 * handing back the same still-time-valid session for the rest of its
 * ~3-minute TTL (LivenessProcessingService::abandon() in afilianet-api).
 *
 * Deliberately fire-and-forget from the caller's perspective -- see
 * LivenessCaptureFlow.tsx's handleNativeError, which never awaits this
 * call's own success or failure. The UI already recovers to a retryable
 * state via its own local dismissal of the exited session, regardless of
 * whether this backend call succeeds, so a network failure here never
 * freezes the UI or blocks a retry -- it only means the old AWS session may
 * stay reachable server-side until its natural TTL instead of being cut
 * short immediately.
 */
export function useAbandonLivenessSession(stepId: string) {
  const abandon = useCallback((): Promise<LivenessSession> => abandonLivenessSession(stepId), [stepId]);
  return { abandon };
}
