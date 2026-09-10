import { File, UploadType } from "expo-file-system";
import { useState } from "react";
import { config } from "../config/env";
import { ApiError } from "../api/errors";
import { strings } from "../i18n";
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
 *
 * DECLARED SIZE (a real physical-device bug this fixed): the size sent to
 * `requestUpload` is measured from the SAME `File` instance that is then
 * PUT -- never a caller-supplied estimate (e.g. expo-image-picker's own
 * `asset.fileSize`). On at least one real Android device, that reported
 * value diverged from the file's actual final on-disk byte count, and the
 * backend's own object-size verification at complete() time (comparing the
 * declared size against a real disk stat of what actually landed) rejected
 * the evidence: "the uploaded object size does not match what was
 * declared" (see EvidenceUploadService::complete() in afilianet-api -- this
 * is a deliberate, non-negotiable integrity check that must never be
 * weakened; the fix belongs entirely here, on the declaring side). Measuring
 * from `file.size` immediately before both the authorize call and the PUT
 * makes the two numbers structurally the same value, not just usually equal.
 */
export function useEvidenceUploadFlow() {
  const [stage, setStage] = useState<EvidenceUploadStage>("idle");
  const requestUpload = useRequestEvidenceUpload();
  const completeUpload = useCompleteEvidenceUpload();

  async function upload(params: { stepId: string; evidenceType: EvidenceType; uri: string; mimeType: string }): Promise<Evidence> {
    setStage("authorizing");
    const file = new File(params.uri);

    try {
      const size = file.size;
      if (!size) {
        throw new ApiError("unknown", strings.documentCapture.corruptedPhoto);
      }

      const authorization = await requestUpload.mutateAsync({
        stepId: params.stepId,
        evidenceType: params.evidenceType,
        mimeType: params.mimeType,
        size,
      });

      setStage("uploading");
      const putResult = await file.upload(authorization.upload.url, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: authorization.upload.headers,
      });

      // Safe, non-sensitive diagnostics only -- never the file's bytes/
      // base64, the presigned URL itself (its query string carries upload
      // credentials), or any request/response header (same reason).
      if (__DEV__ && config.appEnv === "development") {
        console.log("[evidence-upload]", {
          evidenceId: authorization.evidence.id,
          mimeType: params.mimeType,
          declaredSize: size,
          httpStatus: putResult.status,
          responseContentLength: putResult.headers["content-length"] ?? putResult.headers["Content-Length"] ?? null,
        });
      }

      if (putResult.status < 200 || putResult.status >= 300) {
        throw new ApiError("unknown", strings.documentCapture.uploadIncomplete);
      }

      setStage("completing");
      const evidence = await completeUpload.mutateAsync(authorization.evidence.id);

      try {
        file.delete();
      } catch {
        // Best-effort cleanup only -- a failed local delete never blocks the
        // upload itself from being considered successful.
      }

      return evidence;
    } finally {
      // Always runs, on every exit path (success or any thrown error at any
      // stage) -- a prior version only reset this explicitly on the PUT-
      // failure branch, so a completeUpload rejection (exactly what the
      // real size-mismatch failure above causes) left `stage` stuck at
      // "completing" forever, permanently disabling Retake/Retry (both
      // read `uploadFlow.stage !== "idle"`).
      setStage("idle");
    }
  }

  return { upload, stage };
}
