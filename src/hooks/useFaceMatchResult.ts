import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchFaceMatchResult } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";
import type { FaceMatchProcessingResult } from "../types/api";
import { useApiQuery } from "./useApiQuery";

const POLL_INTERVAL_MS = 3000;

/**
 * Mirrors useDocumentResult.ts exactly (Phase 9C.2's polling pattern,
 * applied to face match): the latest face-match processing attempt for a
 * step, polled while an attempt is in flight. A 404 (no attempt triggered
 * yet) is treated as "no result", not an error.
 *
 * Polling stops automatically once `status` reaches a terminal value
 * (completed/failed) or there's no result yet to poll for, and stops
 * entirely once nothing observes this query (screen unmount, org switch --
 * the query key below already varies by organization, so it's covered by
 * OrganizationProvider's existing "compliance" tenant-invalidation domain).
 *
 * A `completed` attempt (any verdict) always calls
 * ComplianceService::attemptStepAsProvider() server-side exactly once, so
 * the compliance case/steps/affiliate profile can go stale the moment
 * polling observes that transition -- same invalidation set
 * useDocumentResult uses. This only fires once per newly-seen completed
 * attempt (tracked by id), not on every poll tick. A technical `failed`
 * attempt never touches compliance state at all, so no invalidation
 * happens for that case -- EXCEPT `failure_reason: "ambiguous_document_reference"`
 * (Phase 9D.4), which the backend ALSO resolves server-side (routing the
 * case into manual_review, same mechanism as a genuine `verdict: review`)
 * even though the FaceMatchProcessingResult itself stays `status: "failed"`
 * (no biometric comparison ever ran) -- without this exception, the
 * compliance-steps query could go stale indefinitely and the affiliate
 * would keep seeing the technical-failure screen instead of the
 * "needs review" state FaceMatchStep.tsx renders once the step catches up.
 */
export function useFaceMatchResult(stepId: string | undefined) {
  const { activeOrganization } = useOrganization();
  const orgId = activeOrganization?.id;
  const queryClient = useQueryClient();
  const lastInvalidatedResultId = useRef<string | null>(null);
  const queryKey = ["compliance", "face-match-result", orgId, stepId];

  const query = useApiQuery<FaceMatchProcessingResult | null>(
    queryKey,
    async () => {
      let fetched: FaceMatchProcessingResult | null;
      try {
        fetched = await fetchFaceMatchResult(stepId as string);
      } catch (error) {
        if (isApiError(error) && error.kind === "not_found") {
          fetched = null;
        } else {
          throw error;
        }
      }
      // useTriggerFaceMatchProcessing's onSuccess writes a brand-new attempt
      // straight into this exact cache entry the instant a retry is
      // triggered (see that hook). A poll tick already in flight (or one
      // that fires before the backend's own "latest attempt" read model has
      // caught up) can still resolve with the PREVIOUS terminal attempt a
      // moment later -- without this guard that stale response overwrites
      // the fresh one, briefly flashing the old failed/no_match result right
      // after a new submission has already started (a real physical-device
      // finding, compliance case 97). attempt_number is monotonic per step,
      // so a fetched attempt strictly older than what's already cached is
      // always a stale race, never a legitimate update, and is discarded.
      const cached = queryClient.getQueryData<FaceMatchProcessingResult | null>(queryKey);
      if (cached && fetched && fetched.attempt_number < cached.attempt_number) {
        return cached;
      }
      return fetched;
    },
    {
      enabled: Boolean(orgId) && Boolean(stepId),
      refetchInterval: (activeQuery) => {
        const status = activeQuery.state.data?.status;
        return status === "pending" || status === "processing" ? POLL_INTERVAL_MS : false;
      },
    },
  );

  useEffect(() => {
    const result = query.data;
    if (!result || !orgId) return;
    const touchesComplianceState = result.status === "completed" || result.failure_reason === "ambiguous_document_reference";
    if (!touchesComplianceState) return;
    if (lastInvalidatedResultId.current === result.id) return;
    lastInvalidatedResultId.current = result.id;
    void queryClient.invalidateQueries({ queryKey: ["compliance", "me", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["affiliate", "me", orgId] });
  }, [query.data, orgId, queryClient]);

  return query;
}
