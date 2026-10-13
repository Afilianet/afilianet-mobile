import { fetch as expoFetch } from "expo/fetch";
import { apiRequest } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { SurveySource } from "./source";
import type { AudioConfig, AudioUploadSession, AvailableSurvey, ResponseReceipt, SurveyVersion } from "./types";

/**
 * afilianet-api surveys (feat/survey-module @ 5d5642e). Authenticated, with
 * the active organization's X-Organization-ID from the API client; callers
 * guard that it is still the organization they started with.
 */
export function createApiSurveySource(): SurveySource {
  const base = "/api/v1/surveys";
  const id = (value: string) => encodeURIComponent(value);

  return {
    kind: "api",

    async listAvailable() {
      return (await apiRequest<{ data: AvailableSurvey[] }>(`${base}/available`)).data;
    },

    async getVersion(_organizationId, versionId) {
      return (await apiRequest<{ data: SurveyVersion }>(`${base}/versions/${id(versionId)}`)).data;
    },

    async submitResponse(_organizationId, versionId, submission) {
      const { data } = await apiRequest<{ data: ResponseReceipt }>(`${base}/versions/${id(versionId)}/responses`, {
        method: "POST",
        body: submission,
      });
      return data;
    },

    async getAudioConfig() {
      return (await apiRequest<{ data: AudioConfig }>(`${base}/audio-config`)).data;
    },

    async uploadAudio(_organizationId, input) {
      // A NEW session on every attempt: the server reuses a still-fresh pending one.
      const { data: session } = await apiRequest<{ data: AudioUploadSession }>(`${base}/responses/${id(input.responseId)}/audio/uploads`, {
        method: "POST",
        body: { mime_type: input.mimeType, size: input.bytes.byteLength },
      });
      let response: Response;
      try {
        response = await expoFetch(session.url, {
          method: session.method || "PUT",
          headers: Object.entries(session.headers ?? {}).filter(([name]) => name.toLowerCase() !== "host"),
          body: input.bytes.slice().buffer,
        });
      } catch {
        throw new ApiError("offline", "No se pudo subir el audio.");
      }
      if (!response.ok) throw new ApiError("server", "No se pudo subir el audio.", response.status);
      // Idempotent: confirming twice is a 200. The server verifies size and type itself.
      await apiRequest(`${base}/responses/${id(input.responseId)}/audio/${id(session.id)}/complete`, {
        method: "POST",
        body: { duration_seconds: input.durationSeconds, interrupted: input.interrupted },
      });
    },
  };
}
