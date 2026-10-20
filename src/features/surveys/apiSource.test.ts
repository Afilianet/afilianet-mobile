import { fetch as expoFetch } from "expo/fetch";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { createApiSurveySource } from "./apiSource";

// Contract: afilianet-api feat/survey-module @ aa94798 (docs/surveys/SURVEY_CONTRACT.md).
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

describe("API surveys source (contract aa94798)", () => {
  it("lists the member inbox from /surveys/available, authenticated and scoped to the organization", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ survey_id: "s-1", id: "11111111-1111-4111-8111-111111111111", version_number: 1, title: "T", status: "published", closes_at: null, allows_self_response: true, allows_interview_response: false, is_assigned_surveyor: false }] }));
    const list = await source.listAvailable("org-a");
    expect(list[0]).toMatchObject({ survey_id: "s-1", id: "11111111-1111-4111-8111-111111111111" });
    expect(call(0).url).toBe("https://api.test/api/v1/surveys/available");
    expect(call(0).headers).toMatchObject({ Authorization: "Bearer session-token", "X-Organization-ID": "org-a" });
  });

  it("downloads one version in full from /surveys/versions/{version}", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "11111111-1111-4111-8111-111111111111", questions: [] } }));
    expect((await source.getVersion("org-a", "11111111-1111-4111-8111-111111111111")).id).toBe("11111111-1111-4111-8111-111111111111");
    expect(call(0).url).toBe("https://api.test/api/v1/surveys/versions/11111111-1111-4111-8111-111111111111");
  });

  it("normalizes decimal bounds that PostgreSQL serializes as strings, and a missing options list", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "11111111-1111-4111-8111-111111111111", questions: [
      { id: 1, uuid: "q", position: 0, type: "number", prompt: "Años", required: true, scale_min: null, scale_max: null, number_min: "0.00", number_max: "80.50" },
      { id: 2, uuid: "q2", position: 1, type: "scale", prompt: "Del 1 al 10", required: true, scale_min: 1, scale_max: "10", number_min: null, number_max: null },
    ] } }));
    const version = await source.getVersion("org-a", "11111111-1111-4111-8111-111111111111");
    expect(version.questions[0]).toMatchObject({ number_min: 0, number_max: 80.5, options: [] });
    expect(version.questions[1]).toMatchObject({ scale_min: 1, scale_max: 10 });
  });

  it("keeps the JSON numbers the API sends since aa94798, including whole numbers without a fraction", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "11111111-1111-4111-8111-111111111111", questions: [
      { id: 1, uuid: "q", position: 0, type: "number", prompt: "Años", required: true, scale_min: null, scale_max: null, number_min: 0, number_max: 80.5, options: [] },
    ] } }));
    const version = await source.getVersion("org-a", "11111111-1111-4111-8111-111111111111");
    expect(version.questions[0]).toMatchObject({ number_min: 0, number_max: 80.5 });
  });

  it("submits to /surveys/versions/{version}/responses with the client idempotency key and typed answers", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "22222222-2222-4222-8222-222222222222", survey_version_id: "11111111-1111-4111-8111-111111111111", client_response_id: "33333333-3333-4333-8333-333333333333", respondent_type: "self", status: "submitted", submitted_at: "a", received_at: "b", consent_audio: "not_applicable" } }, 201));
    const receipt = await source.submitResponse("org-a", "11111111-1111-4111-8111-111111111111", {
      client_response_id: "33333333-3333-4333-8333-333333333333",
      respondent_type: "self",
      submitted_at: "2026-10-12T10:00:00Z",
      consent_audio: null,
      consent_version: null,
      answers: [{ question_id: 1, value_choice_ids: [3] }, { question_id: 2, skipped: true }],
    });
    expect(receipt.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(call(0)).toMatchObject({ url: "https://api.test/api/v1/surveys/versions/11111111-1111-4111-8111-111111111111/responses" });
    expect(call(0).body).toMatchObject({ client_response_id: "33333333-3333-4333-8333-333333333333", answers: [{ question_id: 1, value_choice_ids: [3] }, { question_id: 2, skipped: true }] });
  });

  it("keeps the contract's reason on a closed version", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Cerrada", reason: "survey_version_closed" }, 422));
    const error = await source
      .submitResponse("org-a", "11111111-1111-4111-8111-111111111111", { client_response_id: "33333333-3333-4333-8333-333333333333", respondent_type: "self", submitted_at: "x", consent_audio: null, consent_version: null, answers: [] })
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
      .mockResolvedValueOnce(json({ data: { id: "44444444-4444-4444-8444-444444444444", url: "https://bucket.test/put", method: "PUT", headers: { "Content-Type": "audio/mp4", Host: "bucket.test" }, expires_at: "x" } }))
      .mockResolvedValueOnce(json({ data: { id: "44444444-4444-4444-8444-444444444444", status: "uploaded" } }));
    putMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await source.uploadAudio("org-a", { responseId: "22222222-2222-4222-8222-222222222222", mimeType: "audio/mp4", bytes: new Uint8Array([1, 2, 3]), durationSeconds: 42, interrupted: true }, () => undefined);

    expect(call(0).url).toBe("https://api.test/api/v1/surveys/responses/22222222-2222-4222-8222-222222222222/audio/uploads");
    expect(call(0).body).toEqual({ mime_type: "audio/mp4", size: 3 });
    const [putUrl, putInit] = putMock.mock.calls[0];
    expect(putUrl).toBe("https://bucket.test/put");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toEqual([["Content-Type", "audio/mp4"]]);
    expect(call(1).url).toBe("https://api.test/api/v1/surveys/responses/22222222-2222-4222-8222-222222222222/audio/44444444-4444-4444-8444-444444444444/complete");
    expect(call(1).body).toEqual({ duration_seconds: 42, interrupted: true });
  });

  it("does not confirm an upload whose bytes did not land", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: "44444444-4444-4444-8444-444444444444", url: "https://bucket.test/put", method: "PUT", headers: {}, expires_at: "x" } }));
    putMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      source.uploadAudio("org-a", { responseId: "22222222-2222-4222-8222-222222222222", mimeType: "audio/mp4", bytes: new Uint8Array([1]), durationSeconds: 1, interrupted: false }, () => undefined),
    ).rejects.toMatchObject({ kind: "server" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no complete call
  });

  it("never confirms an upload under another account when the session changes while the bytes are uploading", async () => {
    let current = true;
    const sessionChanged = new Error("session changed");
    fetchMock.mockResolvedValueOnce(json({ data: { id: "44444444-4444-4444-8444-444444444444", url: "https://bucket.test/put", method: "PUT", headers: {}, expires_at: "x" } }));
    putMock.mockImplementationOnce(async () => {
      // Signed out and into another account while the PUT was in flight.
      current = false;
      configureApiClient({ getToken: () => "other-account-token", getOrganizationId: () => "org-b" });
      return { ok: true, status: 200 };
    });
    await expect(
      source.uploadAudio("org-a", { responseId: "22222222-2222-4222-8222-222222222222", mimeType: "audio/mp4", bytes: new Uint8Array([1]), durationSeconds: 1, interrupted: false }, () => {
        if (!current) throw sessionChanged;
      }),
    ).rejects.toBe(sessionChanged);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the session request, under the original account; no complete
    expect(call(0).headers).toMatchObject({ Authorization: "Bearer session-token", "X-Organization-ID": "org-a" });
  });

  it("does not even open an upload session once the session has changed", async () => {
    await expect(
      source.uploadAudio("org-a", { responseId: "22222222-2222-4222-8222-222222222222", mimeType: "audio/mp4", bytes: new Uint8Array([1]), durationSeconds: 1, interrupted: false }, () => {
        throw new Error("session changed");
      }),
    ).rejects.toThrow("session changed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("refuses, before any request, an id the contract requires as a UUID (decision E)", async () => {
    const bad = [
      () => source.getVersion("org-a", "fx-v-servicio-2"),
      () => source.submitResponse("org-a", "fx-v-servicio-2", { client_response_id: "33333333-3333-4333-8333-333333333333", respondent_type: "self", submitted_at: "x", consent_audio: null, consent_version: null, answers: [] }),
      () => source.submitResponse("org-a", "11111111-1111-4111-8111-111111111111", { client_response_id: "draft-1", respondent_type: "self", submitted_at: "x", consent_audio: null, consent_version: null, answers: [] }),
      () => source.uploadAudio("org-a", { responseId: "fx-r-1", mimeType: "audio/mp4", bytes: new Uint8Array([1]), durationSeconds: 1, interrupted: false }, () => undefined),
    ];
    for (const call of bad) await expect(call()).rejects.toMatchObject({ name: "InvalidIdentifierError", reason: "invalid_identifier" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("knows its server's origin and stops if the API client no longer points at that server", async () => {
    expect(source.origin).toBe("api:https://api.test");
    const { config } = jest.requireMock("../../config/env") as { config: { apiBaseUrl: string } };
    config.apiBaseUrl = "https://other.test";
    try {
      await expect(source.listAvailable("org-a")).rejects.toThrow(/server changed/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      config.apiBaseUrl = "https://api.test";
    }
  });
});
