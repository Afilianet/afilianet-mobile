import { fetch as expoFetch } from "expo/fetch";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { createApiSurveySource } from "./apiSource";

// Contract: afilianet-api feat/survey-module @ c390e46 (docs/surveys/SURVEY_CONTRACT.md).
// These check Mobile speaks that contract; they are NOT an end-to-end validation.

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const putMock = expoFetch as unknown as jest.Mock;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function call(index: number) {
  const [url, init] = fetchMock.mock.calls[index];
  return { url, init, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  putMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => "org-a" });
});

afterAll(() => {
  global.fetch = originalFetch;
});

const source = createApiSurveySource();

describe("API surveys source (contract c390e46)", () => {
  it("lists the member inbox from /surveys/available, authenticated and scoped to the organization", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ survey_id: "s-1", id: "v-1", version_number: 1, title: "T", status: "published", closes_at: null, allows_self_response: true, allows_interview_response: false, is_assigned_surveyor: false }] }));
    const list = await source.listAvailable("org-a");
    expect(list[0]).toMatchObject({ survey_id: "s-1", id: "v-1" });
    expect(call(0).url).toBe("https://api.test/api/v1/surveys/available");
    expect(call(0).headers).toMatchObject({ Authorization: "Bearer session-token", "X-Organization-ID": "org-a" });
  });

  it("downloads one version in full from /surveys/versions/{version}", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "v-1", questions: [] } }));
    expect((await source.getVersion("org-a", "v-1")).id).toBe("v-1");
    expect(call(0).url).toBe("https://api.test/api/v1/surveys/versions/v-1");
  });

  it("normalizes decimal bounds that PostgreSQL serializes as strings, and a missing options list", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "v-1", questions: [
      { id: 1, uuid: "q", position: 0, type: "number", prompt: "Años", required: true, scale_min: null, scale_max: null, number_min: "0.00", number_max: "80.50" },
      { id: 2, uuid: "q2", position: 1, type: "scale", prompt: "Del 1 al 10", required: true, scale_min: 1, scale_max: "10", number_min: null, number_max: null },
    ] } }));
    const version = await source.getVersion("org-a", "v-1");
    expect(version.questions[0]).toMatchObject({ number_min: 0, number_max: 80.5, options: [] });
    expect(version.questions[1]).toMatchObject({ scale_min: 1, scale_max: 10 });
  });

  it("submits to /surveys/versions/{version}/responses with the client idempotency key and typed answers", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "r-1", survey_version_id: "v-1", client_response_id: "c-1", respondent_type: "self", status: "submitted", submitted_at: "a", received_at: "b", consent_audio: "not_applicable" } }, 201));
    const receipt = await source.submitResponse("org-a", "v-1", {
      client_response_id: "c-1",
      respondent_type: "self",
      submitted_at: "2026-10-12T10:00:00Z",
      consent_audio: null,
      consent_version: null,
      answers: [{ question_id: 1, value_choice_ids: [3] }, { question_id: 2, skipped: true }],
    });
    expect(receipt.id).toBe("r-1");
    expect(call(0)).toMatchObject({ url: "https://api.test/api/v1/surveys/versions/v-1/responses" });
    expect(call(0).body).toMatchObject({ client_response_id: "c-1", answers: [{ question_id: 1, value_choice_ids: [3] }, { question_id: 2, skipped: true }] });
  });

  it("keeps the contract's reason on a closed version", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Cerrada", reason: "survey_version_closed" }, 422));
    const error = await source
      .submitResponse("org-a", "v-1", { client_response_id: "c-1", respondent_type: "self", submitted_at: "x", consent_audio: null, consent_version: null, answers: [] })
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "validation", reason: "survey_version_closed" });
  });

  it("reads audio limits live from /surveys/audio-config", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { max_bytes: 15728640, allowed_mime_types: ["audio/mp4"], upload_url_expiry_seconds: 900 } }));
    expect((await source.getAudioConfig("org-a")).max_bytes).toBe(15728640);
    expect(call(0).url).toBe("https://api.test/api/v1/surveys/audio-config");
  });

  it("uploads audio in three steps: session, presigned PUT (no API credentials), then an idempotent complete", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: { id: "a-1", url: "https://bucket.test/put", method: "PUT", headers: { "Content-Type": "audio/mp4", Host: "bucket.test" }, expires_at: "x" } }))
      .mockResolvedValueOnce(json({ data: { id: "a-1", status: "uploaded" } }));
    putMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await source.uploadAudio("org-a", { responseId: "r-1", mimeType: "audio/mp4", bytes: new Uint8Array([1, 2, 3]), durationSeconds: 42, interrupted: true });

    expect(call(0).url).toBe("https://api.test/api/v1/surveys/responses/r-1/audio/uploads");
    expect(call(0).body).toEqual({ mime_type: "audio/mp4", size: 3 });
    const [putUrl, putInit] = putMock.mock.calls[0];
    expect(putUrl).toBe("https://bucket.test/put");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toEqual([["Content-Type", "audio/mp4"]]);
    expect(call(1).url).toBe("https://api.test/api/v1/surveys/responses/r-1/audio/a-1/complete");
    expect(call(1).body).toEqual({ duration_seconds: 42, interrupted: true });
  });

  it("does not confirm an upload whose bytes did not land", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "a-1", url: "https://bucket.test/put", method: "PUT", headers: {}, expires_at: "x" } }));
    putMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      source.uploadAudio("org-a", { responseId: "r-1", mimeType: "audio/mp4", bytes: new Uint8Array([1]), durationSeconds: 1, interrupted: false }),
    ).rejects.toMatchObject({ kind: "server" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no complete call
  });
});
