import { configureApiClient } from "../../api/client";
import { createApiSurveySource } from "./apiSource";
import { createFixtureSurveySource } from "./fixtureSource";
import { downloadVersion, getDownloaded, listDrafts, refreshInbox, saveDraft, type SurveyDraft } from "./library";
import { displayState, enqueueResponse, listOutbox, syncOutbox } from "./outbox";
import type { SurveyScope } from "./vault";

/**
 * Risk documented in docs/ENCUESTAS_MVP_ES.md («Alternar entre datos de
 * ejemplo y la API real») and docs/AISLAMIENTO_ORIGEN_ENCUESTAS_ES.md:
 * drafts, downloads and the outbox are stored per account+organization, NOT
 * per survey source. These tests REPRODUCE it against simulated HTTP (the
 * real API client and source; only global fetch is replaced). The
 * `it.failing` case states the intended behavior and turns red once source
 * isolation is implemented, so it must then be flipped to a normal test.
 */
jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000, appEnv: "development" } }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("./vault", () => {
  const files = new Map<string, string>();
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  return {
    sealJson: jest.fn(async (scope, name: string, value: unknown) => void files.set(key(scope, name), JSON.stringify(value))),
    openJson: jest.fn(async (scope, name: string) => (files.has(key(scope, name)) ? JSON.parse(files.get(key(scope, name))!) : null)),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
    sealBytes: jest.fn(async () => 0),
    openBytes: jest.fn(async () => null),
    listScopes: jest.fn(async () => []),
    hasItem: jest.fn((scope, name: string) => files.has(key(scope, name))),
    scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
    __files: files,
  };
});

const SCOPE: SurveyScope = { userId: "user-1", organizationId: "org-a" };
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const apiCalls = () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(url)}`);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(async () => {
  (jest.requireMock("./vault") as { __files: Map<string, string> }).__files.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => SCOPE.organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

/** While on the sample source: download a survey and capture a response offline (it stays pending). */
async function pendingSampleResponse() {
  let online = true;
  const sample = createFixtureSurveySource(async () => {
    if (!online) throw Object.assign(new Error("offline"), {});
  });
  await sample.reset();
  const inbox = await refreshInbox(SCOPE, sample);
  const available = inbox.surveys.find((survey) => survey.survey_id === "fx-servicio")!;
  const downloaded = await downloadVersion(SCOPE, sample, available);
  online = false;
  await enqueueResponse(
    SCOPE,
    {
      id: "11111111-1111-4111-8111-111111111111",
      surveyId: downloaded.version.survey_id,
      versionId: downloaded.version.id,
      surveyTitle: downloaded.version.title,
      respondentType: "self",
      consentAudio: null,
      completedAt: "2026-10-20T10:00:00Z",
      audio: null,
    },
    [{ question_id: 1, value_choice_ids: [1] }],
  );
  const draft: SurveyDraft = {
    id: "22222222-2222-4222-8222-222222222222",
    surveyId: downloaded.version.survey_id,
    versionId: downloaded.version.id,
    surveyTitle: downloaded.version.title,
    respondentType: "self",
    answers: { 5: "Borrador de ejemplo" },
    consentAudio: null,
    audio: null,
    updatedAt: "2026-10-20T10:00:00Z",
  };
  await saveDraft(SCOPE, draft);
  return downloaded.version.id;
}

describe("Switching sample → real API with sample data still on the phone (reproduction)", () => {
  it("REPRODUCES: the pending sample response is sent to the real API with its sample version id (deployed d4cec70: 500, retried)", async () => {
    const sampleVersionId = await pendingSampleResponse();
    expect(sampleVersionId).toBe("fx-v-servicio-2");
    fetchMock.mockResolvedValue(json({ message: "Server Error" }, 500));

    await syncOutbox(SCOPE, createApiSurveySource());

    expect(apiCalls()).toContain("POST https://api.test/api/v1/surveys/versions/fx-v-servicio-2/responses");
    const [item] = await listOutbox(SCOPE);
    expect(displayState(item)).toBe("pending_sync"); // keeps being retried against the wrong origin
  });

  it("REPRODUCES: with candidate #67 (malformed id → 404) the same response ends blocked as «no longer available», a misleading cause", async () => {
    await pendingSampleResponse();
    fetchMock.mockResolvedValue(json({ message: "No encontrado." }, 404));

    await syncOutbox(SCOPE, createApiSurveySource());

    const [item] = await listOutbox(SCOPE);
    expect(item.blocked).toBe("version_unavailable");
  });

  it("REPRODUCES: the sample draft and its sample download are still offered under the real source", async () => {
    await pendingSampleResponse();
    const [draft] = await listDrafts(SCOPE);
    expect(draft.versionId).toBe("fx-v-servicio-2");
    expect((await getDownloaded(SCOPE, "fx-servicio"))?.version.id).toBe("fx-v-servicio-2");
  });

  it("REPRODUCES the reverse direction: a pending REAL response is offered to the local sample server, which rejects it as «no longer available» (kept, never «Recibido»)", async () => {
    await enqueueResponse(
      SCOPE,
      {
        id: "33333333-3333-4333-8333-333333333333",
        surveyId: "9b2f0c1e-0000-4000-8000-000000000001",
        versionId: "9b2f0c1e-0000-4000-8000-000000000002",
        surveyTitle: "Encuesta real",
        respondentType: "self",
        consentAudio: null,
        completedAt: "2026-10-20T10:00:00Z",
        audio: null,
      },
      [{ question_id: 1, value_choice_ids: [1] }],
    );
    const sample = createFixtureSurveySource(async () => undefined);
    await sample.reset();
    const submit = jest.spyOn(sample, "submitResponse");

    await syncOutbox(SCOPE, sample);

    expect(submit).toHaveBeenCalledWith("org-a", "9b2f0c1e-0000-4000-8000-000000000002", expect.anything());
    const [item] = await listOutbox(SCOPE);
    expect(item.blocked).toBe("version_unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.failing("INTENDED: a response captured with the sample source is never sent to the real API, and stays on the phone", async () => {
    await pendingSampleResponse();
    fetchMock.mockResolvedValue(json({ message: "Server Error" }, 500));

    await syncOutbox(SCOPE, createApiSurveySource());

    expect(apiCalls().some((call) => call.includes("/surveys/versions/"))).toBe(false);
    expect(await listOutbox(SCOPE)).toHaveLength(1);
  });
});
