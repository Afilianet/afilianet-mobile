import { configureApiClient } from "../../api/client";
import { audioApplies, downloadVersion, refreshInbox, toSubmissionAnswers } from "../../features/surveys/library";
import { enqueueResponse, listOutbox, listReceipts, syncOutbox } from "../../features/surveys/outbox";
import { surveySource } from "../../features/surveys/runtime";
import type { AvailableSurvey } from "../../features/surveys/types";
import contract from "../support/api-contract/surveys-self-response-b1629a6.json";

/**
 * The demo's survey step against the API's own synthetic examples (afilianet-api
 * b1629a6, unchanged in Surveys up to #125 @ b7f0f61), served verbatim to the
 * REAL API source and outbox: available, a version without audio, a self
 * response, its replay (same client_response_id: 201, same id) and 403
 * no_affiliate_profile. The API generated them with quality analysis off and
 * nothing queued.
 */
type Example = { request: { method: string; path: string; body?: Record<string, unknown> }; status: number; response: unknown };
const example = (name: string) => (contract.examples as Record<string, Example>)[name];
const AVAILABLE = example("01-disponibles-200");
const VERSION = example("02-version-sin-audio-200");
const CREATED = example("03-respuesta-propia-201");
const REPLAY = example("04-respuesta-propia-reintento");
const NO_PROFILE = example("05-sin-perfil-de-afiliado-403");

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://staging-api.test", apiTimeoutMs: 5000, appEnv: "staging" } }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../features/surveys/vault", () => {
  const files = new Map<string, string>();
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  return {
    __files: files,
    sealJson: jest.fn(async (scope, name: string, value: unknown) => void files.set(key(scope, name), JSON.stringify(value))),
    openJson: jest.fn(async (scope, name: string) => (files.has(key(scope, name)) ? JSON.parse(files.get(key(scope, name))!) : null)),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
    sealBytes: jest.fn(async () => 0),
    openBytes: jest.fn(async () => null),
    listScopes: jest.fn(async () => []),
    scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
    StorageFullError: class extends Error {},
  };
});
jest.mock("../../features/surveys/runtime", () => {
  const { createApiSurveySource } = jest.requireActual("../../features/surveys/apiSource");
  return { surveySource: createApiSurveySource(), surveysPreviewEnabled: true };
});

const SCOPE = { userId: "user-1", organizationId: "org-demo" };
const posts: Record<string, unknown>[] = [];
let mode: "created" | "lose-answer" | "no-profile" = "created";
const seen = new Set<string>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function route(url: string, init: RequestInit = {}): Promise<Response> {
  const path = url.replace("https://staging-api.test", "");
  if (path === AVAILABLE.request.path) return json(AVAILABLE.status, AVAILABLE.response);
  if (path === VERSION.request.path) return json(VERSION.status, VERSION.response);
  if (path === CREATED.request.path && init.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push(body);
    if (mode === "no-profile") return json(NO_PROFILE.status, NO_PROFILE.response);
    const replay = seen.has(String(body.client_response_id));
    seen.add(String(body.client_response_id));
    if (mode === "lose-answer" && !replay) throw new TypeError("Network request failed");
    // The examples' ids, whatever id the phone generated: what matters is that a replay answers the original.
    return json(201, replay ? REPLAY.response : CREATED.response);
  }
  return json(404, { message: "No encontrado." });
}

const originalFetch = global.fetch;
beforeEach(async () => {
  posts.length = 0;
  seen.clear();
  mode = "created";
  (jest.requireMock("../../features/surveys/vault") as { __files: Map<string, string> }).__files.clear();
  global.fetch = jest.fn(route) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => SCOPE.organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

/** What «Responder yo» → «Enviar respuesta» stores, built from the served version with the app's own conversion. */
async function answerAndQueue(id: string) {
  const inbox = await refreshInbox(SCOPE, surveySource);
  const available = inbox.surveys[0] as AvailableSurvey;
  const { version } = await downloadVersion(SCOPE, surveySource, available);
  const answers = toSubmissionAnswers(version, { 1: [1], 2: "Comentario sintético" });
  await enqueueResponse(
    SCOPE,
    { id, surveyId: version.survey_id, versionId: version.id, surveyTitle: version.title, respondentType: "self", consentAudio: null, completedAt: "2026-11-09T22:00:00Z", origin: surveySource.origin, missingRequired: 0, audio: null },
    answers,
  );
  return { available, version };
}

describe("Self response against the API's examples (b1629a6)", () => {
  it("01 and 02: the listed survey allows a self response and its version records no audio for it", async () => {
    const { available, version } = await answerAndQueue("00000000-0000-4000-8000-0000000000a1");
    expect(available).toMatchObject({ title: "Encuesta sintética de la demo", allows_self_response: true });
    expect(version.audio_mode).toBe("none");
    expect(audioApplies(version, "self")).toBe(false);
  });

  it("03: the body has the example's shape (audio consent null) and the 201 becomes a receipt", async () => {
    await answerAndQueue("00000000-0000-4000-8000-0000000000a1");
    await syncOutbox(SCOPE, surveySource, { force: true });
    const [body] = posts;
    const exampleBody = CREATED.request.body!;
    // The app also sends consent_audio and consent_version as null; the API validates both as nullable and, for
    // a self response, stores not_applicable whatever they say (SurveyResponseService::resolveConsentAudio).
    for (const key of Object.keys(body)) expect([...Object.keys(exampleBody), "consent_audio", "consent_version"]).toContain(key);
    expect(body).toMatchObject({ client_response_id: "00000000-0000-4000-8000-0000000000a1", respondent_type: "self" });
    expect(body.consent_audio ?? null).toBeNull();
    expect(body.consent_version ?? null).toBeNull();
    expect(body.answers).toEqual([{ question_id: 1, value_choice_ids: [1] }, { question_id: 2, value_text: "Comentario sintético" }]);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect(await listReceipts(SCOPE)).toHaveLength(1);
  });

  it("04: a lost answer is retried with the same client_response_id; the API answers the original response, one receipt", async () => {
    mode = "lose-answer";
    await answerAndQueue("00000000-0000-4000-8000-0000000000a1");
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(await listOutbox(SCOPE)).toHaveLength(1);
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(posts).toHaveLength(2);
    expect(posts[1].client_response_id).toBe(posts[0].client_response_id);
    expect((REPLAY.response as { data: { id: string } }).data.id).toBe((CREATED.response as { data: { id: string } }).data.id);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect(await listReceipts(SCOPE)).toHaveLength(1);
  });

  it("05: without an affiliate profile it is refused once, kept on the phone and not retried", async () => {
    mode = "no-profile";
    await answerAndQueue("00000000-0000-4000-8000-0000000000a2");
    await syncOutbox(SCOPE, surveySource, { force: true });
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(posts).toHaveLength(1);
    expect((await listOutbox(SCOPE))[0]).toMatchObject({ blocked: "not_a_member" });
    expect(await listReceipts(SCOPE)).toEqual([]);
  });
});
