import { act, fireEvent, render, waitFor as rawWaitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { listDrafts, refreshInbox } from "../../features/surveys/library";
import { enqueueResponse, listOutbox, listReceipts, syncOutbox } from "../../features/surveys/outbox";
import { surveySource } from "../../features/surveys/runtime";
import SurveyDetailScreen from "../../app/surveys/[surveyId]";
import SurveysInboxScreen from "../../app/surveys/index";

/**
 * Staff interviews against the REAL API source (only fetch is simulated),
 * with the rule of the deployed API (b3175c84):
 * - GET /surveys/available reports `is_assigned_surveyor`, which needs an
 *   affiliate profile -- false for an owner/admin/manager without one;
 * - POST /versions/{v}/responses accepts an interview from an assigned
 *   surveyor OR organization staff (SurveyResponseController::store), and
 *   answers 403 `not_assigned_surveyor` to anyone else.
 * Mobile used to read only `is_assigned_surveyor`, so staff were told they
 * were not authorized for an interview the API accepts.
 */
jest.setTimeout(30_000);
const waitFor = (expectation: () => unknown) => rawWaitFor(expectation, { timeout: 5000 });

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
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ ...jest.requireActual("expo-crypto"), randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, "0")}` }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ surveyId: "aaaaaaaa-0000-4000-8000-000000000001" }),
  useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
}));

const SCOPE = { userId: "user-1", organizationId: "org-qa" };
let mockOrganization: { my_role?: string; my_membership_status?: string } | null = null;
jest.mock("../../features/surveys/runtime", () => {
  const { createApiSurveySource } = jest.requireActual("../../features/surveys/apiSource");
  // Stable, like the app's memoized scope: a new object per render would re-run every effect.
  const scope = { userId: "user-1", organizationId: "org-qa" };
  return {
    surveySource: createApiSurveySource(),
    useSurveyScope: () => scope,
    useSurveyOrganization: () => mockOrganization,
    surveysPreviewEnabled: true,
  };
});

const SURVEY_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VERSION_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const VERSION = {
  id: VERSION_ID,
  survey_id: SURVEY_ID,
  version_number: 1,
  title: "QA E2E audio",
  instructions: null,
  allows_self_response: false,
  allows_interview_response: true,
  audio_mode: "required",
  consent_text: "Consentimiento sintético QA",
  opens_at: null,
  closes_at: null,
  status: "published",
  questions: [{ id: 7, uuid: "q", position: 0, type: "text", prompt: "Pregunta sintética", required: true, scale_min: null, scale_max: null, number_min: null, number_max: null, options: [] }],
};

/** Simulated afilianet-api b3175c84 for one organization. */
const server = { assignedSurveyor: false, staff: false, posts: [] as Record<string, unknown>[] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function route(url: string, init: RequestInit = {}): Promise<Response> {
  const path = url.replace("https://staging-api.test", "");
  if (path === "/api/v1/surveys/available") {
    const { questions: _questions, ...summary } = VERSION;
    return Promise.resolve(json(200, { data: [{ ...summary, is_assigned_surveyor: server.assignedSurveyor }] }));
  }
  if (path === `/api/v1/surveys/versions/${VERSION_ID}`) return Promise.resolve(json(200, { data: VERSION }));
  if (path === `/api/v1/surveys/versions/${VERSION_ID}/responses` && init.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    server.posts.push(body);
    if (body.respondent_type === "interviewed_external" && !server.assignedSurveyor && !server.staff) {
      return Promise.resolve(json(403, { message: "No estás asignado como encuestador en esta organización.", reason: "not_assigned_surveyor" }));
    }
    return Promise.resolve(
      json(201, { data: { id: "cccccccc-0000-4000-8000-000000000001", survey_version_id: VERSION_ID, client_response_id: body.client_response_id, respondent_type: body.respondent_type, status: "submitted", submitted_at: body.submitted_at, received_at: "2026-10-21T16:00:00Z", consent_audio: "declined" } }),
    );
  }
  return Promise.resolve(json(404, { message: "No encontrado." }));
}

const originalFetch = global.fetch;
beforeEach(async () => {
  jest.clearAllMocks();
  (jest.requireMock("../../features/surveys/vault") as { __files: Map<string, string> }).__files.clear();
  Object.assign(server, { assignedSurveyor: false, staff: false, posts: [] });
  mockOrganization = null;
  global.fetch = jest.fn(route) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => SCOPE.organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

async function renderDetail() {
  // What the inbox does first: the list from the API, kept for offline use.
  await refreshInbox(SCOPE, surveySource);
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<SurveyDetailScreen />);
  });
  await waitFor(() => expect(screen.getByText("QA E2E audio")).toBeTruthy());
  return screen;
}

describe("Interviews by organization staff (API b3175c84: assigned surveyor OR staff)", () => {
  it.each(["owner", "admin", "manager"])("an active %s without an affiliate profile may start the interview, and the API accepts it", async (role) => {
    mockOrganization = { my_role: role, my_membership_status: "active" };
    server.staff = true;
    const screen = await renderDetail();

    expect(screen.queryByText("No estás autorizado como encuestador para esta encuesta.")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Iniciar entrevista"));
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const [draft] = await listDrafts(SCOPE);
    expect(draft).toMatchObject({ versionId: VERSION_ID, respondentType: "interviewed_external", origin: "api:https://staging-api.test" });

    // Sent as the response screen does: the API answers 201 and it becomes a receipt.
    await enqueueResponse(
      SCOPE,
      { id: draft.id, surveyId: SURVEY_ID, versionId: VERSION_ID, surveyTitle: draft.surveyTitle, respondentType: "interviewed_external", consentAudio: "declined", completedAt: "2026-10-21T15:59:00Z", audio: null, origin: draft.origin },
      [{ question_id: 7, value_text: "QA" }],
    );
    await syncOutbox(SCOPE, surveySource);
    expect(server.posts).toHaveLength(1);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect((await listReceipts(SCOPE))[0]).toMatchObject({ id: draft.id });
  });

  it("an affiliate who is not an assigned surveyor is told so and cannot start it (the API would refuse it)", async () => {
    mockOrganization = { my_role: "affiliate", my_membership_status: "active" };
    const screen = await renderDetail();
    expect(screen.getByText("No estás autorizado como encuestador para esta encuesta.")).toBeTruthy();
    expect(screen.queryByText("Iniciar entrevista")).toBeNull();
  });

  it("an assigned surveyor may start it, whatever the role", async () => {
    mockOrganization = { my_role: "affiliate", my_membership_status: "active" };
    server.assignedSurveyor = true;
    const screen = await renderDetail();
    expect(screen.getByText("Iniciar entrevista")).toBeTruthy();
  });

  it.each([
    ["a suspended owner membership", { my_role: "owner", my_membership_status: "suspended" }],
    ["no role on the phone", { my_membership_status: "active" }],
    ["no active organization", null],
  ])("%s does not unlock it", async (_case, organization) => {
    mockOrganization = organization;
    const screen = await renderDetail();
    expect(screen.queryByText("Iniciar entrevista")).toBeNull();
  });

  it("the survey list offers the interview mode to staff too", async () => {
    mockOrganization = { my_role: "owner", my_membership_status: "active" };
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<SurveysInboxScreen />);
    });
    await waitFor(() => expect(screen.getByText("Entrevista · Versión 1")).toBeTruthy());
  });
});
