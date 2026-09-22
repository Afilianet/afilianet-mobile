import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
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

      if (__DEV__) {
        console.log("[evidence-upload] authorization-ok", {
          evidenceId: authorization.evidence.id,
          mimeType: params.mimeType,
          declaredSize: size,
        });
      }

      setStage("uploading");
      if (__DEV__) {
        let uploadHost = "unparseable";
        let uploadProtocol = "unknown";
        try {
          const parsed = new URL(authorization.upload.url);
          uploadHost = parsed.hostname;
          uploadProtocol = parsed.protocol;
        } catch {
          // Safe fallback only; never log the full presigned URL.
        }
        console.log("[evidence-upload] put-start", {
          uploadHost,
          uploadProtocol,
          signedHeaderNames: Object.keys(authorization.upload.headers).sort(),
        });
      }

      let putResult: Response;
      try {
        // On the physical Android QA device both File.upload() and passing
        // the File object directly to expo/fetch reject before an HTTP
        // response is produced. Reading the already-small capture
        // (backend-enforced max 8 MiB) into an ArrayBuffer avoids the native
        // file-body bridge while still sending the exact binary bytes.
        const body = await file.arrayBuffer();
        if (__DEV__) {
          console.log("[evidence-upload] body-ready", {
            byteLength: body.byteLength,
            uriScheme: params.uri.split(":")[0] || "unknown",
          });
        }
        putResult = await expoFetch(authorization.upload.url, {
          method: "PUT",
          headers: authorization.upload.headers,
          body,
        });
      } catch (error) {
        // Intentionally do not log the native error message: some native
        // networking errors include the full presigned URL, whose query
        // string is a temporary upload credential.
        if (__DEV__) {
          const rawMessage = error instanceof Error ? error.message : String(error);
          const safeMessage = rawMessage
            .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
            .replace(/X-Amz-[A-Za-z0-9_-]+=[^&\s]+/gi, "X-Amz-[redacted]")
            .slice(0, 300);
          console.log("[evidence-upload] put-threw", {
            errorType: error instanceof Error ? error.name : typeof error,
            safeMessage,
          });
        }
        throw new ApiError("unknown", strings.documentCapture.uploadIncomplete);
      }

      if (__DEV__) {
        console.log("[evidence-upload] put-finished", { httpStatus: putResult.status });
      }

      // Safe, non-sensitive diagnostics only -- never the file's bytes/
      // base64, the presigned URL itself (its query string carries upload
      // credentials), or any request/response header (same reason).
      if (__DEV__ && config.appEnv === "development") {
        console.log("[evidence-upload]", {
          evidenceId: authorization.evidence.id,
          mimeType: params.mimeType,
          declaredSize: size,
          httpStatus: putResult.status,
          responseContentLength: putResult.headers.get("content-length"),
        });
      }

      if (putResult.status < 200 || putResult.status >= 300) {
        throw new ApiError("unknown", strings.documentCapture.uploadIncomplete);
      }

      setStage("completing");
      if (__DEV__) {
        console.log("[evidence-upload] complete-start", { evidenceId: authorization.evidence.id });
      }
      const evidence = await completeUpload.mutateAsync(authorization.evidence.id);
      if (__DEV__) {
        console.log("[evidence-upload] complete-ok", { evidenceId: authorization.evidence.id });
      }

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
