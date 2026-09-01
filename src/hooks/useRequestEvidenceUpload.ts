import { useMutation } from "@tanstack/react-query";
import { requestEvidenceUpload } from "../api/endpoints";
import type { EvidenceType } from "../types/api";

/** Phase 9B upload-session flow, step 1 -- see requestEvidenceUpload's docblock. No cache to invalidate: nothing queries Evidence as a list. */
export function useRequestEvidenceUpload() {
  return useMutation({
    mutationFn: ({ stepId, evidenceType, mimeType, size }: { stepId: string; evidenceType: EvidenceType; mimeType: string; size: number }) =>
      requestEvidenceUpload(stepId, { evidence_type: evidenceType, mime_type: mimeType, size }),
  });
}
