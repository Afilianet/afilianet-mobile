import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchDocumentResult } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useOrganization } from "../state/OrganizationContext";
import type { DocumentProcessingResult } from "../types/api";
import { useApiQuery } from "./useApiQuery";

const POLL_INTERVAL_MS = 3000;

/**
 * The latest document-processing attempt for an identity_document step,
 * polled via TanStack Query while an attempt is in flight. A 404 (no
 * attempt triggered yet) is treated as "no result", not an error -- this is
 * the normal, expected state before the affiliate has submitted anything.
 *
 * Polling stops automatically once `status` reaches a terminal value
 * (completed/failed) or there's no result yet to poll for, and stops
 * entirely once nothing observes this query (screen unmount, org switch --
 * the query key below already varies by organization, so it's covered by
 * OrganizationProvider's existing "compliance" tenant-invalidation domain).
 *
 * A `completed` attempt (any verdict) always calls
 * ComplianceService::attemptStep() server-side exactly once -- see
 * DOCUMENT_ENGINE.md section I -- so the compliance case/steps/affiliate
 * profile can go stale the moment polling observes that transition. A
 * technical `failed` attempt never touches compliance state at all, so no
 * invalidation happens for that case. This only fires once per newly-seen
 * completed attempt (tracked by id), not on every poll tick.
 */
export function useDocumentResult(stepId: string | undefined) {
  const { activeOrganization } = useOrganization();
  const orgId = activeOrganization?.id;
  const queryClient = useQueryClient();
  const lastInvalidatedResultId = useRef<string | null>(null);

  const query = useApiQuery<DocumentProcessingResult | null>(
    ["compliance", "document-result", orgId, stepId],
    async () => {
      try {
        return await fetchDocumentResult(stepId as string);
      } catch (error) {
        if (isApiError(error) && error.kind === "not_found") return null;
        throw error;
      }
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
    if (!result || !orgId || result.status !== "completed") return;
    if (lastInvalidatedResultId.current === result.id) return;
    lastInvalidatedResultId.current = result.id;
    void queryClient.invalidateQueries({ queryKey: ["compliance", "me", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["compliance", "steps", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["affiliate", "me", orgId] });
  }, [query.data, orgId, queryClient]);

  return query;
}
