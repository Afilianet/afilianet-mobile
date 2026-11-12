import { fetch as expoFetch } from "expo/fetch";
import { configureApiClient } from "../../api/client";
import { createApiSurveySource } from "./apiSource";
import { discardRejectedAudio, displayState, enqueueResponse, listOutbox, listReceipts, syncOutbox } from "./outbox";
import { hasItem, sealBytes, type SurveyScope } from "./vault";

// API A1: the audio upload-request answers HTTP 422 with `reason: "audio_consent_required"`
// at the TOP LEVEL of the JSON body when the response's exact version has no consent text.
// The answers were already accepted; only the audio is refused. This runs the whole chain
// (server JSON -> API client -> API surveys source -> outbox) with only fetch and the sealed
// vault faked, so a change in where the reason travels breaks it.

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000 } }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

// In-memory stand-in for the sealed vault (same API, per-scope files).
jest.mock("./vault", () => {
  const files = new Map<string, Uint8Array>();
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  return {
    __files: files,
    listScopes: jest.fn(async () => []),
    sealBytes: jest.fn(async (scope, name: string, bytes: Uint8Array) => {
      files.set(key(scope, name), bytes);
      return bytes.byteLength;
    }),
    openBytes: jest.fn(async (scope, name: string) => files.get(key(scope, name)) ?? null),
    sealJson: jest.fn(async (scope, name: string, value: unknown) => void files.set(key(scope, name), new TextEncoder().encode(JSON.stringify(value)))),
    openJson: jest.fn(async (scope, name: string) => {
      const bytes = files.get(key(scope, name));
      return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    }),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
    hasItem: jest.fn((scope, name: string) => files.has(key(scope, name))),
  };
});

const vaultFiles = (jest.requireMock("./vault") as { __files: Map<string, Uint8Array> }).__files;
const putMock = expoFetch as unknown as jest.Mock;
const fetchMock = jest.fn();
const originalFetch = global.fetch;

const SCOPE: SurveyScope = { userId: "user-1", organizationId: "org-a" };
const VERSION = "11111111-1111-4111-8111-111111111111";
const RESPONSE_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_RESPONSE = "33333333-3333-4333-8333-333333333333";
const AUDIO = "aud-consent";
const OTHER_AUDIO = "aud-other";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const urls = () => fetchMock.mock.calls.map(([url, init]) => `${(init?.method ?? "GET").toUpperCase()} ${String(url).replace("https://api.test/api/v1/surveys", "")}`);
const submits = () => urls().filter((value) => value === `POST /versions/${VERSION}/responses`);
const uploadRequests = () => urls().filter((value) => value === `POST /responses/${RESPONSE_ID}/audio/uploads`);

/** The server: accepts the answers, serves the audio limits, and refuses the audio with `refusal`. */
function server(refusal: unknown) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://api.test/api/v1/surveys", "");
    if (init?.method === "POST" && path === `/versions/${VERSION}/responses`) {
      return json({ data: { id: RESPONSE_ID, survey_version_id: VERSION, client_response_id: CLIENT_RESPONSE, respondent_type: "interviewed_external", status: "submitted", submitted_at: "2026-11-12T10:00:00Z", received_at: "2026-11-12T10:05:00Z", consent_audio: "accepted" } }, 201);
    }
    if (path === "/audio-config") return json({ data: { max_bytes: 1024 * 1024, allowed_mime_types: ["audio/mp4"], upload_url_expiry_seconds: 900 } });
    if (init?.method === "POST" && path === `/responses/${RESPONSE_ID}/audio/uploads`) return json(refusal, 422);
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
  });
}

let source: ReturnType<typeof createApiSurveySource>;

async function interviewWithAudio() {
  await sealBytes(SCOPE, `audio-${AUDIO}`, new Uint8Array([1, 2, 3, 4]));
  await enqueueResponse(
    SCOPE,
    {
      id: CLIENT_RESPONSE,
      origin: source.origin,
      surveyId: "survey-1",
      versionId: VERSION,
      surveyTitle: "Entrevista",
      respondentType: "interviewed_external",
      consentAudio: "accepted",
      completedAt: "2026-11-12T10:00:00Z",
      audio: { clientAudioId: AUDIO, mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: 4 },
    },
    [{ question_id: 1, value_choice_ids: [1] }],
  );
}

beforeEach(() => {
  vaultFiles.clear();
  fetchMock.mockReset();
  putMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => SCOPE.organizationId });
  source = createApiSurveySource();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("API A1: 422 audio_consent_required on the audio upload-request", () => {
  const REFUSAL = { message: "Esta versión no tiene texto de consentimiento.", reason: "audio_consent_required" };

  it("marks only the audio as refused: no PUT, no receipt, the audio stays sealed on the phone", async () => {
    server(REFUSAL);
    await interviewWithAudio();
    await syncOutbox(SCOPE, source);

    expect(submits()).toHaveLength(1);
    expect(uploadRequests()).toHaveLength(1);
    expect(putMock).not.toHaveBeenCalled();
    const [item] = await listOutbox(SCOPE);
    expect(item.responseId).toBe(RESPONSE_ID);
    expect(item.audio?.rejected).toBe("audio_consent_required");
    expect(displayState(item)).toBe("audio_rejected");
    expect(hasItem(SCOPE, `audio-${AUDIO}`)).toBe(true);
    // The confirmed answers already left the phone; nothing is shown as received while the audio is open.
    expect(hasItem(SCOPE, `answers-${CLIENT_RESPONSE}`)).toBe(false);
    expect(await listReceipts(SCOPE)).toEqual([]);
  });

  it("never retries: not on its own, not on returning to the foreground or the periodic pass, not with «Sincronizar ahora»", async () => {
    server(REFUSAL);
    await interviewWithAudio();
    await syncOutbox(SCOPE, source);
    const before = fetchMock.mock.calls.length;

    // Foreground and the periodic retry call syncOutbox without `force`; any backoff is long past.
    await syncOutbox(SCOPE, source, { now: () => Date.now() + 24 * 60 * 60 * 1000 });
    await syncOutbox(SCOPE, source);
    // «Sincronizar ahora» forces.
    await syncOutbox(SCOPE, source, { force: true });

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(submits()).toHaveLength(1);
    expect(uploadRequests()).toHaveLength(1);
    expect(putMock).not.toHaveBeenCalled();
    expect((await listOutbox(SCOPE))[0].audio?.rejected).toBe("audio_consent_required");
    expect(hasItem(SCOPE, `audio-${AUDIO}`)).toBe(true);
  });

  it("«Descartar audio» deletes only this local audio file: no request, other data untouched, the answers become a receipt without audio", async () => {
    server(REFUSAL);
    await sealBytes(SCOPE, `audio-${OTHER_AUDIO}`, new Uint8Array([9]));
    await interviewWithAudio();
    await syncOutbox(SCOPE, source);
    const before = fetchMock.mock.calls.length;
    const filesBefore = [...vaultFiles.keys()];

    await discardRejectedAudio(SCOPE, CLIENT_RESPONSE, source.origin);

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(putMock).not.toHaveBeenCalled();
    expect(hasItem(SCOPE, `audio-${AUDIO}`)).toBe(false);
    expect(hasItem(SCOPE, `audio-${OTHER_AUDIO}`)).toBe(true);
    // Only the audio file left the vault; the rest is index/receipt bookkeeping.
    const removed = filesBefore.filter((name) => !vaultFiles.has(name));
    expect(removed).toEqual([`${SCOPE.userId}/${SCOPE.organizationId}/audio-${AUDIO}`]);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect(await listReceipts(SCOPE)).toEqual([expect.objectContaining({ id: CLIENT_RESPONSE, withAudio: false })]);

    // Nothing is sent afterwards: the answers are neither resent nor duplicated.
    await syncOutbox(SCOPE, source, { force: true });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(submits()).toHaveLength(1);
    expect(await listReceipts(SCOPE)).toHaveLength(1);
  });

  it("the reason must be at the top level: a nested one is not recognized and the audio stays pending (retried)", async () => {
    server({ message: "Esta versión no tiene texto de consentimiento.", errors: { reason: ["audio_consent_required"] }, error: { reason: "audio_consent_required" } });
    await interviewWithAudio();
    await syncOutbox(SCOPE, source);

    const [item] = await listOutbox(SCOPE);
    expect(item.audio?.rejected).toBeUndefined();
    expect(displayState(item)).toBe("audio_pending");
    await syncOutbox(SCOPE, source, { force: true });
    expect(uploadRequests()).toHaveLength(2);
    expect(submits()).toHaveLength(1);
  });
});
