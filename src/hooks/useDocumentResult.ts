import { assistedScopeArgs, scopedComplianceKey, useAssistedComplianceId } from "../state/ComplianceScopeContext";
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
 * technical `failed` attempt leaves the compliance step untouched but
 * changes the separate identity-data status, so the case is refreshed too. This only fires once per newly-seen
 * completed attempt (tracked by id), not on every poll tick.
 */
export function useDocumentResult(stepId: string | undefined) {
  const assistedId = useAssistedComplianceId();
  const { activeOrganization } = useOrganization();
  const orgId = activeOrganization?.id;
  const queryClient = useQueryClient();
  const lastInvalidatedResultId = useRef<string | null>(null);
  const lastLoggedResultSignature = useRef<string | null>(null);

  const queryKey = scopedComplianceKey(["compliance", "document-result", orgId, stepId], assistedId);

  const query = useApiQuery<DocumentProcessingResult | null>(
    queryKey,
    async () => {
      try {
        const result = await fetchDocumentResult(stepId as string, ...assistedScopeArgs(assistedId));
        // useTriggerDocumentProcessing's onSuccess writes a brand-new attempt
        // straight into this exact cache entry the instant a retry is
        // triggered (see that hook). A poll tick already in flight (or one
        // that fires before the backend's own "latest attempt" read model
        // has caught up) can still resolve with the PREVIOUS terminal
        // attempt a moment later -- without this guard that stale response
        // overwrites the fresh one, briefly flashing an old failed/review
        // result (or an old "still processing" label) right after a new
        // submission has already started. Mirrors the same confirmed fix in
        // useFaceMatchResult.ts (compliance case 97): attempt_number is
        // monotonic per step, so a fetched attempt strictly older than
        // what's already cached is always a stale race, never a legitimate
        // update, and is discarded.
        const cached = queryClient.getQueryData<DocumentProcessingResult | null>(queryKey);
        if (cached && result && result.attempt_number < cached.attempt_number) {
          return cached;
        }
        if (__DEV__ && result) {
          const signature = `${result.id}:${result.status}:${result.verdict ?? "none"}`;
          if (lastLoggedResultSignature.current !== signature) {
            lastLoggedResultSignature.current = signature;
            console.log("[document-processing] result", {
            id: result.id,
            status: result.status,
            verdict: result.verdict,
            failureReason: result.failure_reason,
            confirmationStatus: result.confirmation_status,
            confidence: result.confidence,
            processorVersion: result.processor_version,
            fieldConfidences: result.extracted_fields.map((field) => ({
              name: field.name,
              confidence: field.confidence,
            })),
            failedValidationChecks: result.validation_checks
              .filter((check) => !check.passed)
              .map((check) => check.name),
              quality: result.quality?.map((report) => ({
                decodes: report.decodes,
                width: report.width,
                height: report.height,
                meetsMinimumResolution: report.meets_minimum_resolution,
                withinDimensionBounds: report.within_dimension_bounds,
                aspectRatioSane: report.aspect_ratio_sane,
                passed: report.passed,
              })) ?? null,
            });
          }
        }
        return result;
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
    if (!result || !orgId || (result.status !== "completed" && result.status !== "failed")) return;
    if (lastInvalidatedResultId.current === result.id) return;
    lastInvalidatedResultId.current = result.id;
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "me", orgId], assistedId) });
    void queryClient.invalidateQueries({ queryKey: scopedComplianceKey(["compliance", "steps", orgId], assistedId) });
    void queryClient.invalidateQueries({ queryKey: ["affiliate", "me", orgId] });
  }, [query.data, orgId, queryClient, assistedId]);

  return query;
}
