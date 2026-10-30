/* eslint-disable @typescript-eslint/no-require-imports -- boot() reloads the app's modules with jest.resetModules() + require(), as a restart does; jest.mock factories can only require. */
import { device } from "../../tests/support/fakeDevice";
import type { SurveyDraft } from "./library";
import type { OutboxItem } from "./outbox";
import type { SurveySource } from "./source";
import type { SurveyScope } from "./vault";

/**
 * Origin isolation (docs/AISLAMIENTO_ORIGEN_ENCUESTAS_ES.md), end to end:
 * the app's REAL survey storage (vault, library, outbox, upgrade) on an
 * in-memory phone (tests/support/fakeDevice.ts), the real API client and
 * source against two simulated servers -- staging and production -- and the
 * real sample source. `boot()` is an app start: every module is loaded
 * afresh, the phone's data stays.
 */
jest.mock("expo-file-system", () => require("../../tests/support/fakeDevice").fileSystem);
jest.mock("expo-crypto", () => require("../../tests/support/fakeDevice").crypto);
jest.mock("../../services/storage", () => require("../../tests/support/fakeDevice").storage);
jest.mock("@react-native-async-storage/async-storage", () => require("../../tests/support/fakeDevice").asyncStorage);
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "", apiTimeoutMs: 5000, appEnv: "development" } }));
// The presigned PUT goes through the same simulated network.
jest.mock("expo/fetch", () => ({ fetch: (...args: unknown[]) => (globalThis.fetch as (...values: unknown[]) => Promise<Response>)(...args) }));

type Library = typeof import("./library");
type Outbox = typeof import("./outbox");
type Vault = typeof import("./vault");
type Upgrade = typeof import("./originUpgrade");
type Kind = "fixture" | "staging" | "production";

const STAGING = "https://staging-api.afilianet.mx";
const PRODUCTION = "https://api.afilianet.mx";
const STAGING_ORIGIN = "api:https://staging-api.afilianet.mx";
const PRODUCTION_ORIGIN = "api:https://api.afilianet.mx";
const SCOPE: SurveyScope = { userId: "user-1", organizationId: "org-a" };
const AUDIO = new Uint8Array([7, 7, 7, 7, 7, 7]);

// --- simulated servers -------------------------------------------------------

interface SimServer {
  base: string;
  bucket: string;
  surveyId: string;
  versionId: string;
  responses: Map<string, { id: string; body: Record<string, unknown> }>;
  completedAudio: string[];
  failPut: boolean;
  forbidden: boolean;
}

function simServer(base: string, n: number): SimServer {
  return {
    base,
    bucket: `${base.replace("://", "://bucket.")}/put`,
    surveyId: `${n}aaaaaaa-0000-4000-8000-00000000000${n}`,
    versionId: `${n}bbbbbbb-0000-4000-8000-00000000000${n}`,
    responses: new Map(),
    completedAudio: [],
    failPut: false,
    forbidden: false,
  };
}

let servers: SimServer[] = [];
const network = { offline: false };
const session = { token: "token-1" as string | null, organizationId: "org-a" };
const calls: { method: string; url: string }[] = [];
const fetchMock = jest.fn();
const originalFetch = global.fetch;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function version(server: SimServer) {
  return {
    id: server.versionId,
    survey_id: server.surveyId,
    version_number: 1,
    title: `Encuesta (${server === servers[0] ? "staging" : "producción"})`,
    instructions: null,
    allows_self_response: true,
    allows_interview_response: true,
    audio_mode: "optional",
    consent_text: "¿Autoriza la grabación?",
    opens_at: null,
    closes_at: null,
    status: "published",
    questions: [
      { id: 1, uuid: "q-1", position: 0, type: "single_choice", prompt: "¿Cómo calificas?", required: true, scale_min: null, scale_max: null, number_min: null, number_max: null, options: [{ id: 1, position: 0, label: "Bien" }] },
    ],
  };
}

async function route(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  calls.push({ method, url });
  if (network.offline) throw new TypeError("Network request failed");
  const server = servers.find((candidate) => url.startsWith(candidate.base) || url.startsWith(candidate.bucket));
  if (!server) throw new TypeError(`No route to ${url}`);
  if (url.startsWith(server.bucket)) return server.failPut ? new Response("", { status: 503 }) : new Response("", { status: 200 });
  const path = url.slice(server.base.length);
  const headers = (init.headers ?? {}) as Record<string, string>;
  if (!headers["X-Organization-ID"]) return json({ message: "Falta la organización." }, 400);
  if (path === "/api/v1/surveys/available") {
    const { questions: _questions, ...summary } = version(server);
    return json({ data: [{ ...summary, is_assigned_surveyor: true }] });
  }
  if (path === "/api/v1/surveys/audio-config") return json({ data: { max_bytes: 1024, allowed_mime_types: ["audio/mp4"], upload_url_expiry_seconds: 900 } });
  let match = /^\/api\/v1\/surveys\/versions\/([^/]+)$/.exec(path);
  if (match) return match[1] === server.versionId ? json({ data: version(server) }) : json({ message: "No encontrado." }, 404);
  match = /^\/api\/v1\/surveys\/versions\/([^/]+)\/responses$/.exec(path);
  if (match && method === "POST") {
    if (match[1] !== server.versionId) return json({ message: "No encontrado." }, 404);
    if (server.forbidden) return json({ message: "No eres encuestador." }, 403);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const clientId = String(body.client_response_id);
    const existing = server.responses.get(clientId) ?? { id: `${servers.indexOf(server) + 1}ccccccc-0000-4000-8000-${String(server.responses.size + 1).padStart(12, "0")}`, body };
    server.responses.set(clientId, existing);
    return json({ data: { id: existing.id, survey_version_id: server.versionId, client_response_id: clientId, respondent_type: body.respondent_type, status: "submitted", submitted_at: body.submitted_at, received_at: "2026-10-20T12:00:00Z", consent_audio: body.consent_audio ?? "not_applicable" } }, 201);
  }
  match = /^\/api\/v1\/surveys\/responses\/([^/]+)\/audio\/uploads$/.exec(path);
  if (match) {
    if (![...server.responses.values()].some((value) => value.id === match![1])) return json({ message: "No encontrado." }, 404);
    return json({ data: { id: `${servers.indexOf(server) + 1}ddddddd-0000-4000-8000-000000000001`, url: `${server.bucket}/${match[1]}`, method: "PUT", headers: { "Content-Type": "audio/mp4" }, expires_at: "x" } });
  }
  match = /^\/api\/v1\/surveys\/responses\/([^/]+)\/audio\/([^/]+)\/complete$/.exec(path);
  if (match) {
    server.completedAudio.push(match[1]);
    return json({ data: { id: match[2], status: "uploaded" } });
  }
  return json({ message: "No encontrado." }, 404);
}

/** Survey requests (API or bucket), optionally to one server only. */
const surveyCalls = (base?: string) =>
  calls
    .filter(({ url }) => url.includes("/api/v1/surveys") || url.includes("://bucket."))
    .filter(({ url }) => !base || url.startsWith(base) || url.startsWith(base.replace("://", "://bucket.")))
    .map(({ method, url }) => `${method} ${url}`);

// --- the app ---------------------------------------------------------------

interface App {
  library: Library;
  outbox: Outbox;
  vault: Vault;
  upgrade: Upgrade;
  source: SurveySource;
}

/** An app start: fresh modules, the phone's data kept; the build's source is `kind`. */
function boot(kind: Kind): App {
  jest.resetModules();
  const { config } = jest.requireMock("../../config/env") as { config: { apiBaseUrl: string } };
  config.apiBaseUrl = kind === "production" ? PRODUCTION : STAGING;
  const client = require("../../api/client") as typeof import("../../api/client");
  client.configureApiClient({ getToken: () => session.token, getOrganizationId: () => session.organizationId });
  const { ApiError } = require("../../api/errors") as typeof import("../../api/errors");
  const source: SurveySource =
    kind === "fixture"
      ? (require("./fixtureSource") as typeof import("./fixtureSource")).createFixtureSurveySource(async () => {
          if (network.offline) throw new ApiError("offline", "Sin conexión.");
        })
      : (require("./apiSource") as typeof import("./apiSource")).createApiSurveySource();
  return { library: require("./library"), outbox: require("./outbox"), vault: require("./vault"), upgrade: require("./originUpgrade"), source };
}

/** Like the survey screens: inbox, download, a draft (interview, consent accepted), optionally with audio. */
async function captureDraft(app: App, options: { audio?: boolean; scope?: SurveyScope } = {}) {
  const scope = options.scope ?? SCOPE;
  const inbox = await app.library.refreshInbox(scope, app.source);
  const available = inbox.surveys.find((survey) => survey.allows_interview_response)!;
  const { version: downloaded } = await app.library.downloadVersion(scope, app.source, available);
  let draft: SurveyDraft = {
    id: app.outbox.newClientId(),
    surveyId: downloaded.survey_id,
    versionId: downloaded.id,
    surveyTitle: downloaded.title,
    respondentType: "interviewed_external",
    answers: { 1: [1] },
    consentAudio: "accepted",
    audio: null,
    updatedAt: "2026-10-20T10:00:00Z",
    origin: app.source.origin,
  };
  await app.library.saveDraft(scope, draft);
  if (options.audio) {
    const clientAudioId = app.outbox.newClientId();
    await app.vault.sealBytes(scope, app.outbox.audioName(clientAudioId), AUDIO);
    draft = { ...draft, audio: { clientAudioId, mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: AUDIO.byteLength, origin: app.source.origin } };
    await app.library.saveDraft(scope, draft);
  }
  return { draft, version: downloaded };
}

/** Like «Enviar respuesta»: the outbox takes the answers and the audio under the draft's origin; the draft record goes. */
async function submit(app: App, captured: Awaited<ReturnType<typeof captureDraft>>, scope: SurveyScope = SCOPE) {
  const { draft, version: downloaded } = captured;
  await app.outbox.enqueueResponse(
    scope,
    {
      id: draft.id,
      surveyId: draft.surveyId,
      versionId: draft.versionId,
      surveyTitle: draft.surveyTitle,
      respondentType: draft.respondentType,
      consentAudio: "accepted",
      completedAt: "2026-10-20T10:05:00Z",
      missingRequired: 0,
      audio: draft.audio,
      origin: draft.origin!,
    },
    app.library.toSubmissionAnswers(downloaded, draft.answers),
  );
  await app.library.deleteDraft(scope, draft.id);
  return draft;
}

async function keptOnPhone(app: App, scope: SurveyScope, item: { id: string; audio: { clientAudioId: string } | null }) {
  const answers = await app.vault.openJson(scope, `answers-${item.id}`);
  const audio = item.audio ? await app.vault.openBytes(scope, app.outbox.audioName(item.audio.clientAudioId)) : null;
  return { answers: answers !== null, audio: item.audio ? Array.from(audio ?? []).join(",") === Array.from(AUDIO).join(",") : null };
}

const byId = <T extends { id: string }>(records: T[], id: string) => records.find((record) => record.id === id)!;

beforeEach(() => {
  device.reset();
  servers = [simServer(STAGING, 1), simServer(PRODUCTION, 2)];
  network.offline = false;
  session.token = "token-1";
  session.organizationId = "org-a";
  calls.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(route);
  global.fetch = fetchMock as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe("the right origin keeps working", () => {
  it("staging: inbox, download, interview with audio, send; answers then audio reach staging only, with consent; nothing left behind", async () => {
    const app = boot("staging");
    expect(app.source.origin).toBe(STAGING_ORIGIN);
    const sent = await submit(app, await captureDraft(app, { audio: true }));

    const result = await app.outbox.syncOutbox(SCOPE, app.source);

    expect(result).toMatchObject({ received: 1, remaining: 0, otherOrigin: 0 });
    const [staging] = servers;
    expect(staging.responses.get(sent.id)?.body).toMatchObject({ client_response_id: sent.id, consent_audio: "accepted", consent_version: staging.versionId });
    expect(staging.completedAudio).toHaveLength(1);
    expect(surveyCalls(PRODUCTION)).toEqual([]);
    const [receipt] = await app.outbox.listReceipts(SCOPE);
    expect(receipt).toMatchObject({ id: sent.id, withAudio: true, origin: STAGING_ORIGIN });
    expect(await app.outbox.listOutbox(SCOPE)).toEqual([]);
  });

  it("sample data: the same journey stays on the phone (no survey request ever leaves it)", async () => {
    const app = boot("fixture");
    const sent = await submit(app, await captureDraft(app, { audio: true }));

    expect(await app.outbox.syncOutbox(SCOPE, app.source)).toMatchObject({ received: 1, remaining: 0 });
    expect(surveyCalls()).toEqual([]);
    expect((await app.outbox.listReceipts(SCOPE))[0]).toMatchObject({ id: sent.id, withAudio: true, origin: "fixture" });
  });

  it("a 403 without a confirmed reason stays neutral, kept, never retried (API #68 behaviour unchanged)", async () => {
    const app = boot("staging");
    servers[0].forbidden = true;
    const sent = await submit(app, await captureDraft(app, { audio: true }));

    await app.outbox.syncOutbox(SCOPE, app.source);
    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });

    const item = byId(await app.outbox.listOutbox(SCOPE), sent.id);
    expect(item.blocked).toBe("forbidden");
    expect(await keptOnPhone(app, SCOPE, item)).toEqual({ answers: true, audio: true });
    expect(surveyCalls().filter((call) => call.startsWith("POST") && call.includes("/responses"))).toHaveLength(1);
  });
});

describe("sample data ⇄ staging", () => {
  it("a response captured with the sample source is never sent to the real API, and stays on the phone (formerly it.failing)", async () => {
    const sample = boot("fixture");
    const captured = await captureDraft(sample, { audio: true });
    network.offline = true;
    const pending = await submit(sample, captured);
    await sample.outbox.syncOutbox(SCOPE, sample.source);
    network.offline = false;

    const staging = boot("staging");
    const result = await staging.outbox.syncOutbox(SCOPE, staging.source);
    await staging.outbox.syncOutbox(SCOPE, staging.source, { force: true });

    expect(surveyCalls()).toEqual([]);
    expect(result).toMatchObject({ received: 0, otherOrigin: 1 });
    const item = byId(await staging.outbox.listOutbox(SCOPE), pending.id);
    expect(item).toMatchObject({ origin: "fixture", attempts: 1 });
    expect(item.blocked).toBeUndefined();
    expect(await keptOnPhone(staging, SCOPE, item)).toEqual({ answers: true, audio: true });
  });

  it("sample drafts, downloads and the saved inbox are not offered as staging's; the draft and its audio stay", async () => {
    const sample = boot("fixture");
    const { draft } = await captureDraft(sample, { audio: true });

    const staging = boot("staging");
    expect(await staging.library.getDownloaded(SCOPE, draft.surveyId, STAGING_ORIGIN)).toBeNull();
    expect(await staging.library.cachedInbox(SCOPE, STAGING_ORIGIN)).toBeNull();
    const [listed] = await staging.library.listDrafts(SCOPE);
    expect(listed).toMatchObject({ id: draft.id, origin: "fixture" });
    expect(await keptOnPhone(staging, SCOPE, { id: "none", audio: draft.audio })).toMatchObject({ audio: true });
    // Neither a relabelled save nor a send under staging is possible.
    await expect(staging.library.saveDraft(SCOPE, { ...listed, origin: STAGING_ORIGIN })).rejects.toThrow(/cannot change origin/);
    await expect(
      staging.outbox.enqueueResponse(
        SCOPE,
        { ...listed, consentAudio: "accepted", completedAt: "x", origin: STAGING_ORIGIN, audio: listed.audio },
        [],
      ),
    ).rejects.toThrow(/share one origin/);
    expect(await staging.outbox.listOutbox(SCOPE)).toEqual([]);
  });

  it("refreshing staging's list never replaces the sample list saved for offline use, nor the one older builds saved", async () => {
    const sample = boot("fixture");
    await sample.vault.sealJson(SCOPE, "inbox", { surveys: [{ survey_id: "fx-vecinal", id: "fx-v-vecinal-1" }], fetchedAt: "2026-10-01T09:00:00Z" });
    await sample.library.refreshInbox(SCOPE, sample.source);
    const legacy = device.snapshot();

    const staging = boot("staging");
    expect((await staging.library.refreshInbox(SCOPE, staging.source)).surveys[0].id).toBe(servers[0].versionId);

    network.offline = true;
    const back = boot("fixture");
    const saved = await back.library.cachedInbox(SCOPE, "fixture");
    expect(saved?.origin).toBe("fixture");
    expect(saved?.surveys.map((survey) => survey.survey_id).sort()).toEqual(["fx-servicio", "fx-vecinal"]);
    expect((await back.library.cachedInbox(SCOPE, STAGING_ORIGIN))?.surveys[0].id).toBe(servers[0].versionId);
    expect(await back.library.cachedInbox(SCOPE)).toMatchObject({ fetchedAt: "2026-10-01T09:00:00Z", origin: "fixture" });
    // Every file that existed before staging refreshed is still byte-for-byte there.
    const after = JSON.parse(device.snapshot()) as { files: [string, string][] };
    for (const [path, bytes] of (JSON.parse(legacy) as { files: [string, string][] }).files) expect(after.files).toContainEqual([path, bytes]);
  });

  it("back on the sample source, its own pending response goes through the sample server", async () => {
    const sample = boot("fixture");
    const captured = await captureDraft(sample, { audio: true });
    network.offline = true;
    const pending = await submit(sample, captured);
    network.offline = false;
    const staging = boot("staging");
    await staging.outbox.syncOutbox(SCOPE, staging.source);

    const again = boot("fixture");
    expect(await again.outbox.syncOutbox(SCOPE, again.source, { force: true })).toMatchObject({ received: 1, remaining: 0 });
    expect((await again.outbox.listReceipts(SCOPE))[0]).toMatchObject({ id: pending.id, origin: "fixture", withAudio: true });
    expect(surveyCalls()).toEqual([]);
  });

  it("staging → sample: a pending staging response is never offered to the sample server; back on staging it reaches staging", async () => {
    const staging = boot("staging");
    const captured = await captureDraft(staging, { audio: true });
    network.offline = true;
    const pending = await submit(staging, captured);
    await staging.outbox.syncOutbox(SCOPE, staging.source);
    network.offline = false;
    calls.length = 0;

    const sample = boot("fixture");
    const sampleSubmit = jest.spyOn(sample.source, "submitResponse");
    const sampleUpload = jest.spyOn(sample.source, "uploadAudio");
    const result = await sample.outbox.syncOutbox(SCOPE, sample.source, { force: true });

    expect(sampleSubmit).not.toHaveBeenCalled();
    expect(sampleUpload).not.toHaveBeenCalled();
    expect(surveyCalls()).toEqual([]);
    expect(result.otherOrigin).toBe(1);
    const item = byId(await sample.outbox.listOutbox(SCOPE), pending.id);
    expect(item.blocked).toBeUndefined();
    expect(await keptOnPhone(sample, SCOPE, item)).toEqual({ answers: true, audio: true });

    const back = boot("staging");
    expect(await back.outbox.syncOutbox(SCOPE, back.source, { force: true })).toMatchObject({ received: 1 });
    expect(servers[0].responses.has(pending.id)).toBe(true);
    expect(surveyCalls(PRODUCTION)).toEqual([]);
  });
});

describe("staging ⇄ production", () => {
  it("each server only ever receives its own responses and audio, in both directions", async () => {
    // Staging, offline: one pending with audio.
    const staging = boot("staging");
    const stagingCaptured = await captureDraft(staging, { audio: true });
    network.offline = true;
    const fromStaging = await submit(staging, stagingCaptured);
    network.offline = false;

    // Production build: syncs, captures its own, one sent and one left pending.
    const production = boot("production");
    expect(production.source.origin).toBe(PRODUCTION_ORIGIN);
    calls.length = 0;
    const first = await production.outbox.syncOutbox(SCOPE, production.source, { force: true });
    expect(first).toMatchObject({ received: 0, otherOrigin: 1 });
    expect(surveyCalls()).toEqual([]);
    const sentInProduction = await submit(production, await captureDraft(production, { audio: true }));
    await production.outbox.syncOutbox(SCOPE, production.source);
    const prodCaptured = await captureDraft(production, { audio: true });
    network.offline = true;
    const pendingProduction = await submit(production, prodCaptured);
    network.offline = false;

    // Back to staging: only the staging one goes, to staging.
    const stagingAgain = boot("staging");
    calls.length = 0;
    const second = await stagingAgain.outbox.syncOutbox(SCOPE, stagingAgain.source, { force: true });
    expect(second).toMatchObject({ received: 1, otherOrigin: 1 });
    expect(surveyCalls(PRODUCTION)).toEqual([]);
    expect(surveyCalls(STAGING).length).toBeGreaterThan(0);
    const leftover = byId(await stagingAgain.outbox.listOutbox(SCOPE), pendingProduction.id);
    expect(leftover.origin).toBe(PRODUCTION_ORIGIN);
    expect(await keptOnPhone(stagingAgain, SCOPE, leftover)).toEqual({ answers: true, audio: true });

    // Production again: its pending one reaches production.
    const productionAgain = boot("production");
    calls.length = 0;
    expect(await productionAgain.outbox.syncOutbox(SCOPE, productionAgain.source, { force: true })).toMatchObject({ received: 1, remaining: 0 });
    expect(surveyCalls(STAGING)).toEqual([]);

    const [stagingServer, productionServer] = servers;
    expect([...stagingServer.responses.keys()]).toEqual([fromStaging.id]);
    expect([...productionServer.responses.keys()].sort()).toEqual([sentInProduction.id, pendingProduction.id].sort());
    expect(stagingServer.completedAudio).toHaveLength(1);
    expect(productionServer.completedAudio).toHaveLength(2);
    const receipts = await productionAgain.outbox.listReceipts(SCOPE);
    expect(receipts.map((receipt) => [receipt.id, receipt.origin]).sort()).toEqual(
      [
        [fromStaging.id, STAGING_ORIGIN],
        [sentInProduction.id, PRODUCTION_ORIGIN],
        [pendingProduction.id, PRODUCTION_ORIGIN],
      ].sort(),
    );
  });

  it("a staging draft with audio is view-only under production: it cannot be saved or sent as production's", async () => {
    const staging = boot("staging");
    const { draft } = await captureDraft(staging, { audio: true });

    const production = boot("production");
    const loaded = (await production.library.loadDraft(SCOPE, draft.id))!;
    expect(loaded.origin).toBe(STAGING_ORIGIN);
    await expect(production.library.saveDraft(SCOPE, { ...loaded, origin: PRODUCTION_ORIGIN })).rejects.toThrow(/cannot change origin/);
    await expect(production.library.saveDraft(SCOPE, { ...loaded, audio: { ...loaded.audio!, origin: PRODUCTION_ORIGIN } })).rejects.toThrow(/draft's own origin/);
    expect(await production.library.getDownloaded(SCOPE, draft.surveyId, PRODUCTION_ORIGIN)).toBeNull();
    expect(await keptOnPhone(production, SCOPE, { id: "none", audio: draft.audio })).toMatchObject({ audio: true });
  });
});

describe("records stored before origins existed", () => {
  const LEGACY_FIXTURE = "aaaaaaaa-1111-4111-8111-000000000001";
  const LEGACY_UUID = "aaaaaaaa-1111-4111-8111-000000000002";
  const LEGACY_ODD = "aaaaaaaa-1111-4111-8111-000000000003";
  const LEGACY_DRAFT_FIXTURE = "aaaaaaaa-1111-4111-8111-000000000004";
  const LEGACY_DRAFT_UUID = "aaaaaaaa-1111-4111-8111-000000000005";

  /** What an older build wrote: the same files, without any origin. */
  async function writeLegacy(app: App, scope: SurveyScope = SCOPE) {
    const { sealJson, sealBytes } = app.vault;
    const base = { surveyTitle: "Anterior", consentAudio: "accepted", completedAt: "2026-10-10T10:00:00Z", attempts: 2 };
    const items = [
      { ...base, id: LEGACY_FIXTURE, surveyId: "fx-vecinal", versionId: "fx-v-vecinal-1", respondentType: "interviewed_external", audio: { clientAudioId: "legacy-audio-1", mimeType: "audio/mp4", durationMs: 3000, interrupted: false, bytes: AUDIO.byteLength } },
      // A version that DOES exist on staging: a UUID alone must still not send it there.
      { ...base, id: LEGACY_UUID, surveyId: servers[0].surveyId, versionId: servers[0].versionId, respondentType: "self", consentAudio: null, audio: null },
      { ...base, id: LEGACY_ODD, surveyId: "s-1", versionId: "v-1", respondentType: "self", consentAudio: null, audio: null },
    ];
    await sealJson(scope, "outbox", items);
    for (const item of items) await sealJson(scope, `answers-${item.id}`, [{ question_id: 1, value_choice_ids: [1] }]);
    await sealBytes(scope, "audio-legacy-audio-1", AUDIO);
    const draft = { surveyTitle: "Anterior", respondentType: "self", answers: { 1: [1] }, consentAudio: null, audio: null, updatedAt: "2026-10-10T10:00:00Z" };
    await sealJson(scope, `draft-${LEGACY_DRAFT_FIXTURE}`, { ...draft, id: LEGACY_DRAFT_FIXTURE, surveyId: "fx-servicio", versionId: "fx-v-servicio-2" });
    await sealJson(scope, `draft-${LEGACY_DRAFT_UUID}`, { ...draft, id: LEGACY_DRAFT_UUID, surveyId: servers[0].surveyId, versionId: servers[0].versionId });
    await sealJson(scope, "drafts", [LEGACY_DRAFT_FIXTURE, LEGACY_DRAFT_UUID]);
    await sealJson(scope, "version-fx-vecinal", { version: { id: "fx-v-vecinal-1", survey_id: "fx-vecinal", questions: [] }, downloadedAt: "2026-10-10T09:00:00Z" });
    await sealJson(scope, `version-${servers[0].surveyId}`, { version: version(servers[0]), downloadedAt: "2026-10-10T09:00:00Z" });
    await sealJson(scope, "receipts", [{ id: "aaaaaaaa-1111-4111-8111-000000000009", surveyTitle: "Anterior", receivedAt: "2026-10-09T10:00:00Z", withAudio: false }]);
    await sealJson(scope, "inbox", { surveys: [{ survey_id: "fx-vecinal", id: "fx-v-vecinal-1" }], fetchedAt: "2026-10-10T09:00:00Z" });
  }

  it("classifies sample data only with unequivocal evidence; a UUID or anything else is «unconfirmed», never sent to staging", async () => {
    await writeLegacy(boot("staging"));
    const staging = boot("staging");
    await staging.upgrade.upgradeLegacyOrigins(SCOPE);

    const origins = Object.fromEntries((await staging.outbox.listOutbox(SCOPE)).map((item) => [item.id, item.origin]));
    expect(origins).toEqual({ [LEGACY_FIXTURE]: "fixture", [LEGACY_UUID]: "unconfirmed", [LEGACY_ODD]: "unconfirmed" });
    const drafts = Object.fromEntries((await staging.library.listDrafts(SCOPE)).map((draft) => [draft.id, draft.origin]));
    expect(drafts).toEqual({ [LEGACY_DRAFT_FIXTURE]: "fixture", [LEGACY_DRAFT_UUID]: "unconfirmed" });
    expect((await staging.outbox.listReceipts(SCOPE))[0].origin).toBe("unconfirmed");
    expect((await staging.library.cachedInbox(SCOPE))?.origin).toBe("fixture");
    expect((await staging.library.getDownloaded(SCOPE, servers[0].surveyId))?.origin).toBe("unconfirmed");

    const result = await staging.outbox.syncOutbox(SCOPE, staging.source, { force: true });
    expect(surveyCalls()).toEqual([]);
    expect(result).toMatchObject({ received: 0, otherOrigin: 3 });
    for (const item of await staging.outbox.listOutbox(SCOPE)) expect((await keptOnPhone(staging, SCOPE, item)).answers).toBe(true);
  });

  it("the known sample record goes through the sample source (with its audio); the unconfirmed ones stay", async () => {
    await writeLegacy(boot("fixture"));
    const sample = boot("fixture");
    const submitSpy = jest.spyOn(sample.source, "submitResponse");

    const result = await sample.outbox.syncOutbox(SCOPE, sample.source, { force: true });

    expect(result).toMatchObject({ received: 1, otherOrigin: 2 });
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith("org-a", "fx-v-vecinal-1", expect.objectContaining({ client_response_id: LEGACY_FIXTURE }));
    expect((await sample.outbox.listOutbox(SCOPE)).map((item) => item.id).sort()).toEqual([LEGACY_UUID, LEGACY_ODD].sort());
    expect((await sample.outbox.listReceipts(SCOPE)).find((receipt) => receipt.id === LEGACY_FIXTURE)).toMatchObject({ origin: "fixture", withAudio: true });
  });

  it("an unconfirmed record cannot be relabelled to force it out: not by saving, not by re-enqueuing, not through the ledger", async () => {
    await writeLegacy(boot("staging"));
    const staging = boot("staging");
    const draft = (await staging.library.loadDraft(SCOPE, LEGACY_DRAFT_UUID))!;

    await expect(staging.library.saveDraft(SCOPE, { ...draft, origin: STAGING_ORIGIN })).rejects.toThrow(/cannot change origin/);
    const [legacy] = (await staging.outbox.listOutbox(SCOPE)).filter((item) => item.id === LEGACY_UUID);
    await staging.outbox.enqueueResponse(SCOPE, { ...legacy, origin: STAGING_ORIGIN }, []);
    // A ledger edited to name a server is ignored: it can only ever say «fixture» or «unconfirmed».
    await staging.vault.sealJson(SCOPE, "origins", { version: 1, entries: { [`outbox:${LEGACY_UUID}`]: STAGING_ORIGIN, [`draft:${LEGACY_DRAFT_UUID}`]: STAGING_ORIGIN } });

    const restarted = boot("staging");
    expect(byId(await restarted.outbox.listOutbox(SCOPE), LEGACY_UUID).origin).toBe("unconfirmed");
    expect((await restarted.library.loadDraft(SCOPE, LEGACY_DRAFT_UUID))?.origin).toBe("unconfirmed");
    await restarted.outbox.syncOutbox(SCOPE, restarted.source, { force: true });
    expect(surveyCalls()).toEqual([]);
    expect(servers[0].responses.size).toBe(0);
  });
});

describe("audio and partial syncs", () => {
  it("answers received on staging, audio pending: under production nothing moves; back on staging the audio reaches staging's bucket", async () => {
    const staging = boot("staging");
    servers[0].failPut = true;
    const sent = await submit(staging, await captureDraft(staging, { audio: true }));
    await staging.outbox.syncOutbox(SCOPE, staging.source);
    const partial = byId(await staging.outbox.listOutbox(SCOPE), sent.id);
    expect(staging.outbox.displayState(partial)).toBe("audio_pending");
    servers[0].failPut = false;

    const production = boot("production");
    const before = device.snapshot();
    calls.length = 0;
    await production.outbox.syncOutbox(SCOPE, production.source, { force: true });
    expect(calls).toEqual([]);
    expect(device.snapshot()).toBe(before);

    const back = boot("staging");
    expect(await back.outbox.syncOutbox(SCOPE, back.source, { force: true })).toMatchObject({ received: 1 });
    expect(surveyCalls(PRODUCTION)).toEqual([]);
    expect(servers[0].completedAudio).toEqual([partial.responseId]);
    expect((await back.outbox.listReceipts(SCOPE))[0]).toMatchObject({ withAudio: true, origin: STAGING_ORIGIN });
  });

  it("an audio whose recorded origin disagrees with its response is never uploaded, by either server", async () => {
    const staging = boot("staging");
    servers[0].failPut = true;
    const sent = await submit(staging, await captureDraft(staging, { audio: true }));
    await staging.outbox.syncOutbox(SCOPE, staging.source);
    servers[0].failPut = false;
    // Tampered on disk: the audio claims production.
    const items = (await staging.vault.openJson<OutboxItem[]>(SCOPE, "outbox"))!;
    await staging.vault.sealJson(SCOPE, "outbox", items.map((item) => (item.id === sent.id ? { ...item, audio: { ...item.audio!, origin: PRODUCTION_ORIGIN } } : item)));
    calls.length = 0;

    const stagingAgain = boot("staging");
    await stagingAgain.outbox.syncOutbox(SCOPE, stagingAgain.source, { force: true });
    const production = boot("production");
    await production.outbox.syncOutbox(SCOPE, production.source, { force: true });

    expect(surveyCalls()).toEqual([]);
    const item = byId(await production.outbox.listOutbox(SCOPE), sent.id);
    expect(await keptOnPhone(production, SCOPE, { id: item.id, audio: item.audio })).toMatchObject({ audio: true });
  });

  it("the origin is read from disk again right before each request: an item relabelled mid-sync is not sent (answers)", async () => {
    const app = boot("staging");
    const first = await captureDraft(app);
    const second = await captureDraft(app);
    network.offline = true;
    await submit(app, first);
    await submit(app, second);
    network.offline = false;
    const send = app.source.submitResponse.bind(app.source);
    jest.spyOn(app.source, "submitResponse").mockImplementationOnce(async (...args) => {
      const items = (await app.vault.openJson<OutboxItem[]>(SCOPE, "outbox"))!;
      await app.vault.sealJson(SCOPE, "outbox", items.map((item) => (item.id === second.draft.id ? { ...item, origin: PRODUCTION_ORIGIN } : item)));
      return send(...args);
    });

    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });

    expect([...servers[0].responses.keys()]).toEqual([first.draft.id]);
    expect(byId(await app.outbox.listOutbox(SCOPE), second.draft.id).origin).toBe(PRODUCTION_ORIGIN);
  });

  it("the audio's origin is read from disk again right before its upload (audio)", async () => {
    const app = boot("staging");
    servers[0].failPut = true;
    const first = await submit(app, await captureDraft(app, { audio: true }));
    const second = await submit(app, await captureDraft(app, { audio: true }));
    await app.outbox.syncOutbox(SCOPE, app.source);
    servers[0].failPut = false;
    const upload = app.source.uploadAudio.bind(app.source);
    jest.spyOn(app.source, "uploadAudio").mockImplementationOnce(async (...args) => {
      const items = (await app.vault.openJson<OutboxItem[]>(SCOPE, "outbox"))!;
      await app.vault.sealJson(SCOPE, "outbox", items.map((item) => (item.id === second.id ? { ...item, audio: { ...item.audio!, origin: PRODUCTION_ORIGIN } } : item)));
      return upload(...args);
    });

    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });

    expect(servers[0].completedAudio).toEqual([servers[0].responses.get(first.id)!.id]);
    expect(byId(await app.outbox.listReceipts(SCOPE), first.id)).toMatchObject({ withAudio: true });
    const kept = byId(await app.outbox.listOutbox(SCOPE), second.id);
    expect(app.outbox.displayState(kept)).toBe("audio_pending");
    expect(await keptOnPhone(app, SCOPE, { id: kept.id, audio: kept.audio })).toMatchObject({ audio: true });
  });

  it("a response and its audio must share one origin to be stored", async () => {
    const staging = boot("staging");
    const captured = await captureDraft(staging, { audio: true });
    await expect(
      submit(staging, { ...captured, draft: { ...captured.draft, audio: { ...captured.draft.audio!, origin: PRODUCTION_ORIGIN } } }),
    ).rejects.toThrow(/share one origin/);
    expect(await staging.outbox.listOutbox(SCOPE)).toEqual([]);
    expect((await staging.library.listDrafts(SCOPE)).map((draft) => draft.id)).toEqual([captured.draft.id]);
  });
});

describe("the legacy upgrade", () => {
  const ORG_B: SurveyScope = { userId: "user-1", organizationId: "org-b" };
  const legacyItem = (id: string, versionId: string, surveyId: string) => ({
    id,
    surveyId,
    versionId,
    surveyTitle: "Anterior",
    respondentType: "self",
    consentAudio: null,
    completedAt: "2026-10-10T10:00:00Z",
    audio: null,
    attempts: 0,
  });

  async function legacyIn(app: App, scope: SurveyScope) {
    await app.vault.sealJson(scope, "outbox", [legacyItem(`${scope.organizationId === "org-a" ? "a" : "b"}aaaaaaa-0000-4000-8000-000000000001`, "fx-v-servicio-2", "fx-servicio"), legacyItem(`${scope.organizationId === "org-a" ? "a" : "b"}aaaaaaa-0000-4000-8000-000000000002`, servers[0].versionId, servers[0].surveyId)]);
    await app.vault.sealJson(scope, "receipts", [{ id: "r", surveyTitle: "Anterior", receivedAt: "x", withAudio: false }]);
  }

  it("interrupted midway, it changes no record; repeated, it finishes; again, it writes nothing", async () => {
    const app = boot("staging");
    await legacyIn(app, SCOPE);
    await legacyIn(app, ORG_B);
    const records = device.snapshot(/origins/);
    const classified = async (scope: SurveyScope) => (await boot("staging").outbox.listOutbox(scope)).map((item) => item.origin);
    const expected = { a: await classified(SCOPE), b: await classified(ORG_B) };
    expect(expected.a).toEqual(["fixture", "unconfirmed"]);

    device.failNextWrite(/org-b\/origins\.sealed$/);
    expect(await boot("staging").upgrade.upgradeAllLegacyOrigins()).toEqual({ scopes: 2, failed: 1 });
    expect(device.snapshot(/origins/)).toBe(records);
    expect(await classified(ORG_B)).toEqual(expected.b);

    expect(await boot("staging").upgrade.upgradeAllLegacyOrigins()).toEqual({ scopes: 2, failed: 0 });
    const writes = device.writes().length;
    const third = boot("staging");
    expect(await third.upgrade.upgradeLegacyOrigins(SCOPE)).toEqual({ added: 0 });
    expect(await third.upgrade.upgradeLegacyOrigins(ORG_B)).toEqual({ added: 0 });
    expect(device.writes().length).toBe(writes);
    expect(device.snapshot(/origins/)).toBe(records);
    expect({ a: await classified(SCOPE), b: await classified(ORG_B) }).toEqual(expected);
  });

  it("a damaged ledger reads as empty (same classification, nothing sent) and the next run rewrites it", async () => {
    const app = boot("staging");
    await legacyIn(app, SCOPE);
    await app.upgrade.upgradeLegacyOrigins(SCOPE);
    const ledgerPath = [...device.files().keys()].find((path) => path.endsWith("org-a/origins.sealed"))!;
    device.files().set(ledgerPath, new Uint8Array([1, 2, 3]));

    const restarted = boot("staging");
    expect((await restarted.outbox.listOutbox(SCOPE)).map((item) => item.origin)).toEqual(["fixture", "unconfirmed"]);
    await restarted.outbox.syncOutbox(SCOPE, restarted.source, { force: true });
    expect(surveyCalls()).toEqual([]);
    expect((await restarted.upgrade.upgradeLegacyOrigins(SCOPE)).added).toBeGreaterThan(0);
    expect(await restarted.vault.openJson(SCOPE, "origins")).toMatchObject({ version: 1 });
  });
});

describe("reconnection, restart, account and organization", () => {
  it("offline → restart → reconnect: the stamped origin survives and the response reaches its own server once", async () => {
    let app = boot("staging");
    const captured = await captureDraft(app, { audio: true });
    network.offline = true;
    const pending = await submit(app, captured);
    expect((await app.outbox.syncOutbox(SCOPE, app.source)).stoppedReason).toBe("offline");

    app = boot("production"); // another build in between
    network.offline = false;
    calls.length = 0;
    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });
    expect(surveyCalls()).toEqual([]);

    app = boot("staging"); // restart on staging, connection back
    expect(byId(await app.outbox.listOutbox(SCOPE), pending.id).origin).toBe(STAGING_ORIGIN);
    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });
    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });
    expect(servers[0].responses.size).toBe(1);
    expect(servers[1].responses.size).toBe(0);
    expect(surveyCalls(PRODUCTION)).toEqual([]);
  });

  it("another account or organization never lists or sends it; switching organization mid-sync stops before the next request", async () => {
    const app = boot("staging");
    const first = await captureDraft(app, { audio: true });
    const second = await captureDraft(app);
    network.offline = true;
    await submit(app, first);
    await submit(app, second);
    network.offline = false;
    calls.length = 0;

    // Another account, or another organization of the same account: nothing of this one is listed or sent.
    for (const other of [{ userId: "user-2", organizationId: "org-a" }, { userId: "user-1", organizationId: "org-b" }]) {
      expect(await app.outbox.listOutbox(other)).toEqual([]);
      expect(await app.outbox.syncOutbox(other, app.source, { force: true })).toMatchObject({ received: 0, remaining: 0 });
    }
    expect(surveyCalls()).toEqual([]);

    // The organization changes while the first answers are on their way.
    const send = app.source.submitResponse.bind(app.source);
    jest.spyOn(app.source, "submitResponse").mockImplementationOnce(async (...args) => {
      session.organizationId = "org-b";
      return send(...args);
    });
    expect((await app.outbox.syncOutbox(SCOPE, app.source, { force: true })).stoppedReason).toBe("session_changed");
    expect(surveyCalls().filter((call) => call.startsWith("POST"))).toHaveLength(1);
    expect(await app.outbox.listOutbox(SCOPE)).toHaveLength(2);

    // Back in the original organization: both arrive, the first one is not duplicated.
    session.organizationId = "org-a";
    expect(await app.outbox.syncOutbox(SCOPE, app.source, { force: true })).toMatchObject({ received: 2, remaining: 0 });
    expect([...servers[0].responses.keys()].sort()).toEqual([first.draft.id, second.draft.id].sort());
    expect(surveyCalls(PRODUCTION)).toEqual([]);
  });
});

describe("identifiers checked before the real API (decision E)", () => {
  it("a record of this origin with an id the contract would refuse is kept, blocked with a clear reason, and never requested", async () => {
    const app = boot("staging");
    await app.vault.sealBytes(SCOPE, "audio-bad-audio", AUDIO);
    await app.outbox.enqueueResponse(
      SCOPE,
      { id: "11111111-2222-4333-8444-555555555555", surveyId: "fx-vecinal", versionId: "fx-v-vecinal-1", surveyTitle: "T", respondentType: "self", consentAudio: null, completedAt: "x", audio: null, origin: STAGING_ORIGIN },
      [],
    );
    await app.outbox.enqueueResponse(
      SCOPE,
      { id: "not-a-uuid", surveyId: servers[0].surveyId, versionId: servers[0].versionId, surveyTitle: "T", respondentType: "self", consentAudio: null, completedAt: "x", audio: null, origin: STAGING_ORIGIN },
      [],
    );
    // Answers already received, but the server id is not a UUID: the audio is refused locally.
    const items = (await app.vault.openJson<OutboxItem[]>(SCOPE, "outbox"))!;
    await app.vault.sealJson(SCOPE, "outbox", [
      ...items,
      { id: "22222222-2222-4333-8444-555555555555", surveyId: servers[0].surveyId, versionId: servers[0].versionId, surveyTitle: "T", respondentType: "interviewed_external", consentAudio: "accepted", completedAt: "x", attempts: 0, responseId: "fx-r-1", origin: STAGING_ORIGIN, audio: { clientAudioId: "bad-audio", mimeType: "audio/mp4", durationMs: 1000, interrupted: false, bytes: AUDIO.byteLength, origin: STAGING_ORIGIN } },
    ]);
    calls.length = 0;

    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });
    await app.outbox.syncOutbox(SCOPE, app.source, { force: true });

    expect(surveyCalls().filter((call) => !call.endsWith("/audio-config"))).toEqual([]);
    const listed = await app.outbox.listOutbox(SCOPE);
    expect(listed.map((item) => [item.id, item.blocked ?? item.audio?.rejected])).toEqual([
      ["11111111-2222-4333-8444-555555555555", "invalid_identifier"],
      ["not-a-uuid", "invalid_identifier"],
      ["22222222-2222-4333-8444-555555555555", "invalid_identifier"],
    ]);
    for (const item of listed) expect((await keptOnPhone(app, SCOPE, item)).answers || item.responseId).toBeTruthy();
    expect(await app.vault.openBytes(SCOPE, "audio-bad-audio")).not.toBeNull();
  });
});
