import { useCallback } from "react";
import { fetchLivenessCredentials } from "../api/endpoints";
import type { LivenessCredentials } from "../types/api";

/**
 * Deliberately NOT a TanStack Query hook -- unlike every other read in this
 * app, temporary AWS STS credentials must never be cached anywhere,
 * including TanStack Query's own query cache (which persists in memory for
 * the query's gcTime, is inspectable via devtools, and would otherwise be
 * the very first place a value like this would normally live in this
 * codebase). This hook exposes a single `fetchCredentials()` callback that
 * calls the backend endpoint directly and returns the result -- nothing is
 * stored by this hook itself. The caller (the native liveness-capture
 * component) is responsible for holding the result ONLY in local
 * component state/a ref for the lifetime of one capture attempt, and
 * clearing that reference on completion, cancellation, unmount, or org
 * switch (see LivenessCaptureFlow.tsx). Never AsyncStorage, never
 * SecureStore, never analytics, never console.log, never Sentry, never any
 * global/persisted state.
 */
export function useLivenessCredentials(stepId: string) {
  const fetchCredentials = useCallback((): Promise<LivenessCredentials> => fetchLivenessCredentials(stepId), [stepId]);
  return { fetchCredentials };
}
