import { fetch as expoFetch } from "expo/fetch";
import { apiRequest } from "../../api/client";
import { ApiError } from "../../api/errors";
import { config } from "../../config/env";
import { apiOrigin, InvalidIdentifierError, isUuid, OriginMismatchError } from "./origin";
import type { SurveySource } from "./source";
import type { AudioConfig, AudioUploadSession, AvailableSurvey, ResponseReceipt, SurveyQuestion, SurveyVersion } from "./types";

export { InvalidIdentifierError, isInvalidIdentifierError } from "./origin";

/** The API casts decimals to JSON numbers since aa94798 (before that they came as strings like "0.00"); accept either form. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalizes a downloaded version so validation never depends on the database's number encoding. */
export function normalizeVersion(raw: SurveyVersion): SurveyVersion {
  return {
    ...raw,
    questions: (raw.questions ?? []).map(
      (question): SurveyQuestion => ({
        ...question,
        scale_min: toNumber(question.scale_min),
        scale_max: toNumber(question.scale_max),
        number_min: toNumber(question.number_min),
        number_max: toNumber(question.number_max),
        options: question.options ?? [],
      }),
    ),
  };
}

/**
 * afilianet-api surveys (feat/survey-module @ aa94798). Authenticated, with
 * the active organization's X-Organization-ID from the API client; callers
 * guard that it is still the organization they started with.
 *
 * Its origin is the configured server's identity. Every call checks that the
 * API client still points at that same server, so a record stamped for one
 * server can never be sent to another.
 */
export function createApiSurveySource(): SurveySource {
  const base = "/api/v1/surveys";
  const id = (value: string) => encodeURIComponent(value);
  const origin = apiOrigin(config.apiBaseUrl);
  const sameServer = () => {
    if (apiOrigin(config.apiBaseUrl) !== origin) throw new OriginMismatchError("The API server changed after this source was created.");
  };
  // API contract: every surveys route identifier is a UUID (routes ->whereUuid).
  const uuid = (value: string, field: InvalidIdentifierError["field"]) => {
    if (!isUuid(value)) throw new InvalidIdentifierError(field);
    return id(value);
  };

  return {
    kind: "api",
    origin,

    async listAvailable() {
      sameServer();
      return (await apiRequest<{ data: AvailableSurvey[] }>(`${base}/available`)).data;
    },

    async getVersion(_organizationId, versionId) {
      sameServer();
      return normalizeVersion((await apiRequest<{ data: SurveyVersion }>(`${base}/versions/${uuid(versionId, "version")}`)).data);
    },

    async submitResponse(_organizationId, versionId, submission) {
      sameServer();
      const path = `${base}/versions/${uuid(versionId, "version")}/responses`;
      if (!isUuid(submission.client_response_id)) throw new InvalidIdentifierError("client_response_id");
      const { data } = await apiRequest<{ data: ResponseReceipt }>(path, {
        method: "POST",
        body: submission,
      });
      return data;
    },

    async getAudioConfig() {
      sameServer();
      return (await apiRequest<{ data: AudioConfig }>(`${base}/audio-config`)).data;
    },

    async uploadAudio(_organizationId, input, assertCurrent) {
      assertCurrent();
      sameServer();
      const response = uuid(input.responseId, "response");
      // A NEW session on every attempt: the server reuses a still-fresh pending one.
      const { data: session } = await apiRequest<{ data: AudioUploadSession }>(`${base}/responses/${response}/audio/uploads`, {
        method: "POST",
        body: { mime_type: input.mimeType, size: input.bytes.byteLength },
      });
      assertCurrent();
      // The server's own upload id: if it is malformed that is a server fault, retried later, never the record's.
      if (!isUuid(session.id)) throw new ApiError("server", "No se pudo subir el audio.");
      const audio = id(session.id);
      let upload: Response;
      try {
        upload = await expoFetch(session.url, {
          method: session.method || "PUT",
          headers: Object.entries(session.headers ?? {}).filter(([name]) => name.toLowerCase() !== "host"),
          body: input.bytes.slice().buffer,
        });
      } catch {
        throw new ApiError("offline", "No se pudo subir el audio.");
      }
      if (!upload.ok) throw new ApiError("server", "No se pudo subir el audio.", upload.status);
      // Idempotent: confirming twice is a 200. The server verifies size and type itself.
      assertCurrent();
      sameServer();
      await apiRequest(`${base}/responses/${response}/audio/${audio}/complete`, {
        method: "POST",
        body: { duration_seconds: input.durationSeconds, interrupted: input.interrupted },
      });
    },
  };
}
