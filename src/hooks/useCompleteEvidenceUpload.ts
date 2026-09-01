import { useMutation } from "@tanstack/react-query";
import { completeEvidenceUpload } from "../api/endpoints";

/** Phase 9B upload-session flow, step 3 -- confirms the direct PUT actually landed. Idempotent server-side; no local cache to invalidate. */
export function useCompleteEvidenceUpload() {
  return useMutation({
    mutationFn: (evidenceId: string) => completeEvidenceUpload(evidenceId),
  });
}
