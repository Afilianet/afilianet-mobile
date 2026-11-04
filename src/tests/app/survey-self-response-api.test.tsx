import { act, fireEvent, render, waitFor as rawWaitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { listDrafts, refreshInbox } from "../../features/surveys/library";
import { listOutbox, listReceipts, syncOutbox } from "../../features/surveys/outbox";
import { surveySource } from "../../features/surveys/runtime";
import SurveyDetailScreen from "../../app/(app)/surveys/[surveyId]";
import SurveyResponseScreen from "../../app/(app)/surveys/response/[draftId]";

/**
 * The demo's survey step (2026-11-09) with the demo-apk switches
 * (EXPO_PUBLIC_SURVEYS_PREVIEW=1, EXPO_PUBLIC_SURVEYS_SOURCE=api): an
 * affiliate answers a survey without audio by themselves, through the REAL
 * API source and screens; only fetch is simulated, following API #119's
 * SurveyController/SurveyResponseController (synthetic data):
 * - GET /surveys/available lists the organization's published, open versions;
 * - a self response needs only an affiliate profile in the active
 *   organization (403 `no_affiliate_profile` otherwise), no KYC;
 * - POST /versions/{v}/responses is idempotent on client_response_id: a
 *   repeat returns the original response, 201 both times.
 */
jest.setTimeout(30_000);
const waitFor = (expectation: () => unknown) => rawWaitFor(expectation, { timeout: 5000 });

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://staging-api.test", apiTimeoutMs: 5000, appEnv: "staging" } }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
// The microphone module is present (as in the APK), so nothing short-circuits it: it must simply never be asked.
jest.mock("../../features/surveys/audioSupport", () => ({ audioRecordingSupported: true }));
jest.mock("expo-audio", () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: jest.fn(() => ({ prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null })),
  useAudioRecorderState: jest.fn(() => ({ isRecording: false, durationMillis: 0 })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
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
    ensureSpace: jest.fn(async () => undefined),
    listScopes: jest.fn(async () => []),
    scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
    StorageFullError: class extends Error {},
  };
});
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ ...jest.requireActual("expo-crypto"), randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, "0")}` }));

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
}));

const SCOPE = { userId: "user-1", organizationId: "org-demo" };
jest.mock("../../features/surveys/runtime", () => {
  const { createApiSurveySource } = jest.requireActual("../../features/surveys/apiSource");
  const scope = { userId: "user-1", organizationId: "org-demo" };
  const organization = { id: "org-demo", name: "Organización sintética", my_role: "affiliate", my_membership_status: "active" };
  return { surveySource: createApiSurveySource(), useSurveyScope: () => scope, useSurveyOrganization: () => organization, surveysPreviewEnabled: true };
});

const SURVEY_ID = "aaaaaaaa-0000-4000-8000-000000000009";
const VERSION_ID = "bbbbbbbb-0000-4000-8000-000000000009";
const VERSION = {
  id: VERSION_ID,
  survey_id: SURVEY_ID,
  version_number: 1,
  title: "Encuesta sintética sin audio",
  instructions: null,
  allows_self_response: true,
  allows_interview_response: false,
  audio_mode: "none",
  consent_text: null,
  opens_at: null,
  closes_at: null,
  status: "published",
  questions: [{ id: 11, uuid: "q-11", position: 0, type: "text", prompt: "Pregunta sintética", required: true, scale_min: null, scale_max: null, number_min: null, number_max: null, options: [] }],
};

/** Simulated API #119 for one organization: responses stored once per client_response_id. */
const server = {
  /** False: the version is not open yet (published later, or opens_at in the future). */
  published: true,
  affiliateProfile: true,
  network: "up" as "up" | "down" | "lose-answer",
  posts: [] as Record<string, unknown>[],
  stored: new Map<string, { id: string; received_at: string }>(),
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function route(url: string, init: RequestInit = {}): Promise<Response> {
  const path = url.replace("https://staging-api.test", "");
  if (server.network === "down") throw new TypeError("Network request failed");
  if (path === "/api/v1/surveys/available") {
    if (!server.published) return json(200, { data: [] });
    const { questions: _questions, consent_text: _consent, instructions: _instructions, audio_mode: _audio, opens_at: _opens, survey_id, ...summary } = VERSION;
    return json(200, { data: [{ ...summary, survey_id, is_assigned_surveyor: false }] });
  }
  if (path === `/api/v1/surveys/versions/${VERSION_ID}`) return json(200, { data: VERSION });
  if (path === `/api/v1/surveys/versions/${VERSION_ID}/responses` && init.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    server.posts.push(body);
    if (!server.affiliateProfile) return json(403, { message: "Tu cuenta no tiene perfil de afiliado en esta organización.", reason: "no_affiliate_profile" });
    const clientId = String(body.client_response_id);
    if (!server.stored.has(clientId)) server.stored.set(clientId, { id: `cccccccc-0000-4000-8000-${String(server.stored.size + 1).padStart(12, "0")}`, received_at: "2026-11-09T16:00:00Z" });
    const row = server.stored.get(clientId)!;
    // The server stored it, but the phone never gets the answer (connection cut on the way back).
    if (server.network === "lose-answer") {
      server.network = "up";
      throw new TypeError("Network request failed");
    }
    return json(201, { data: { id: row.id, survey_version_id: VERSION_ID, client_response_id: clientId, respondent_type: body.respondent_type, status: "submitted", submitted_at: body.submitted_at, received_at: row.received_at, consent_audio: "not_applicable" } });
  }
  return json(404, { message: "No encontrado." });
}

const originalFetch = global.fetch;
beforeEach(async () => {
  jest.clearAllMocks();
  await (jest.requireMock("@react-native-async-storage/async-storage") as { clear: () => Promise<void> }).clear();
  (jest.requireMock("../../features/surveys/vault") as { __files: Map<string, string> }).__files.clear();
  Object.assign(server, { published: true, affiliateProfile: true, network: "up", posts: [], stored: new Map() });
  mockParams = { surveyId: SURVEY_ID };
  global.fetch = jest.fn(route) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => SCOPE.organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

/** Detail → «Responder yo» → answer → «Enviar respuesta»: the response lands in the outbox, as on the phone. */
async function answerMyself() {
  await refreshInbox(SCOPE, surveySource);
  let detail!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    detail = await render(<SurveyDetailScreen />);
  });
  await waitFor(() => expect(detail.getByText("Encuesta sintética sin audio")).toBeTruthy());
  await act(async () => {
    fireEvent.press(detail.getByText("Responder yo"));
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  const [draft] = await listDrafts(SCOPE);
  expect(draft).toMatchObject({ versionId: VERSION_ID, respondentType: "self", origin: "api:https://staging-api.test" });

  mockParams = { draftId: draft.id };
  let response!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    response = await render(<SurveyResponseScreen />);
  });
  await waitFor(() => expect(response.getByText("Pregunta sintética")).toBeTruthy());
  // No consent or recording UI for a self response, whatever the audio mode.
  expect(response.queryByText("Consentimiento para grabar")).toBeNull();
  await act(async () => {
    fireEvent.changeText(response.getByLabelText("Tu respuesta"), "Respuesta sintética");
  });
  await act(async () => {
    fireEvent.press(response.getByText("Enviar respuesta"));
  });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  return draft;
}

describe("Demo: answering a survey without audio by oneself (API source)", () => {
  it("is sent once as a self response, becomes «Recibido» and never asks for the microphone", async () => {
    const draft = await answerMyself();
    const [item] = await listOutbox(SCOPE);
    expect(item).toMatchObject({ id: draft.id, respondentType: "self" });

    await syncOutbox(SCOPE, surveySource);
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]).toMatchObject({ respondent_type: "self", answers: [{ question_id: 11, value_text: "Respuesta sintética" }] });
    expect(server.posts[0].consent_audio ?? null).toBeNull();
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect((await listReceipts(SCOPE))[0]).toMatchObject({ id: draft.id });

    const expoAudio = jest.requireMock("expo-audio") as Record<string, jest.Mock>;
    expect(expoAudio.getRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(expoAudio.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it("offline at send time: stays on the phone; when the network returns it is sent with the same id", async () => {
    await answerMyself();
    server.network = "down";
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(server.posts).toHaveLength(0);
    expect(await listOutbox(SCOPE)).toHaveLength(1);
    expect(await listReceipts(SCOPE)).toEqual([]);

    server.network = "up";
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(server.posts).toHaveLength(1);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect(await listReceipts(SCOPE)).toHaveLength(1);
  });

  it("a lost answer (stored by the server, never received): the retry reuses the id and the server keeps one response", async () => {
    await answerMyself();
    server.network = "lose-answer";
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(await listOutbox(SCOPE)).toHaveLength(1);

    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(server.posts).toHaveLength(2);
    expect(server.posts[1].client_response_id).toBe(server.posts[0].client_response_id);
    expect(server.stored.size).toBe(1);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect(await listReceipts(SCOPE)).toHaveLength(1);
  });

  it("an account without an affiliate profile in the organization: refused, kept on the phone and never retried as if it could pass", async () => {
    server.affiliateProfile = false;
    await answerMyself();
    await syncOutbox(SCOPE, surveySource, { force: true });
    await syncOutbox(SCOPE, surveySource, { force: true });
    expect(server.posts).toHaveLength(1);
    const [item] = await listOutbox(SCOPE);
    expect(item).toMatchObject({ blocked: "not_a_member" });
    expect(await listReceipts(SCOPE)).toEqual([]);
  });
});

describe("Opening a survey from a notification or Home (API source)", () => {
  async function renderDetail() {
    let detail!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      detail = await render(<SurveyDetailScreen />);
    });
    return detail;
  }

  it("the list saved on the phone predates its publication: asks the server and offers to answer it", async () => {
    server.published = false;
    await refreshInbox(SCOPE, surveySource);
    server.published = true;

    const detail = await renderDetail();
    await waitFor(() => expect(detail.getByText("Encuesta sintética sin audio")).toBeTruthy());
    expect(detail.getByText("Responder yo")).toBeTruthy();
    expect(detail.queryByText(/ya no está disponible/)).toBeNull();
  });

  it("with no list saved yet (the list was never opened), it is found the same way", async () => {
    const detail = await renderDetail();
    await waitFor(() => expect(detail.getByText("Responder yo")).toBeTruthy());
  });

  it("only when the server does not list it either does it say it is not available", async () => {
    server.published = false;
    const detail = await renderDetail();
    await waitFor(() => expect(detail.getByText(/Esta encuesta ya no está disponible/)).toBeTruthy());
    expect(detail.queryByText("Responder yo")).toBeNull();
  });

  it("offline with nothing saved: says so, never that the survey closed", async () => {
    server.network = "down";
    const detail = await renderDetail();
    await waitFor(() => expect(detail.getByText(/Sin conexión y sin una lista guardada/)).toBeTruthy());
  });
});
