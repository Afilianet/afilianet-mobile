import { File, UploadType } from "expo-file-system";
import { useState } from "react";
import { ApiError } from "../api/errors";
import type { Evidence, EvidenceType } from "../types/api";
import { useCompleteEvidenceUpload } from "./useCompleteEvidenceUpload";
import { useRequestEvidenceUpload } from "./useRequestEvidenceUpload";

export type EvidenceUploadStage = "idle" | "authorizing" | "uploading" | "completing";

/**
 * The real Phase 9B flow end-to-end: authorize -> direct PUT -> complete.
 * The client never sends the image through the normal Laravel JSON API and
 * never inspects/assumes anything about `upload.url` beyond "PUT here with
 * these headers" -- treated identically whether it's a real S3 presigned
 * URL or the local-dev signed-route stand-in (Phase 9C.2's requirement).
 *
 * Deletes the local capture on success (data-minimization: no local
 * document-photo archive is ever built -- see this phase's report). On
 * failure the local file is left in place so the caller can offer a
 * one-tap retry without asking the user to recapture.
 */
export function useEvidenceUploadFlow() {
  const [stage, setStage] = useState<EvidenceUploadStage>("idle");
  const requestUpload = useRequestEvidenceUpload();
  const completeUpload = useCompleteEvidenceUpload();

  async function upload(params: {
    stepId: string;
    evidenceType: EvidenceType;
    uri: string;
    mimeType: string;
    size: number;
  }): Promise<Evidence> {
    setStage("authorizing");
    const authorization = await requestUpload.mutateAsync({
      stepId: params.stepId,
      evidenceType: params.evidenceType,
      mimeType: params.mimeType,
      size: params.size,
    });

    setStage("uploading");
    const file = new File(params.uri);
    const putResult = await file.upload(authorization.upload.url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers: authorization.upload.headers,
    });

    if (putResult.status < 200 || putResult.status >= 300) {
      setStage("idle");
      throw new ApiError("unknown", "The upload didn't complete. Please try again.");
    }

    setStage("completing");
    const evidence = await completeUpload.mutateAsync(authorization.evidence.id);

    try {
      file.delete();
    } catch {
      // Best-effort cleanup only -- a failed local delete never blocks the
      // upload itself from being considered successful.
    }

    setStage("idle");
    return evidence;
  }

  return { upload, stage };
}
