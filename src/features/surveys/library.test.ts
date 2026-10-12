import { ApiError } from "../../api/errors";
import { createFixtureSurveySource } from "./fixtureSource";
import {
  cachedInbox,
  deleteDraft,
  downloadVersion,
  getDownloaded,
  listDrafts,
  loadDraft,
  refreshInbox,
  saveDraft,
  toSubmissionAnswers,
  validateAll,
  validateAnswer,
  type SurveyDraft,
} from "./library";
import type { SurveyQuestion } from "./types";
import type { SurveyScope } from "./vault";

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test" } }));
jest.mock("./vault", () => {
  const files = new Map<string, string>();
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  return {
    __files: files,
    sealJson: jest.fn(async (scope, name: string, value: unknown) => void files.set(key(scope, name), JSON.stringify(value))),
    openJson: jest.fn(async (scope, name: string) => (files.has(key(scope, name)) ? JSON.parse(files.get(key(scope, name))!) : null)),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
  };
});

const files = (jest.requireMock("./vault") as { __files: Map<string, string> }).__files;
const SCOPE: SurveyScope = { userId: "user-1", organizationId: "org-a" };
const OTHER: SurveyScope = { userId: "user-1", organizationId: "org-b" };
let online = true;
const source = createFixtureSurveySource(async () => {
  if (!online) throw new ApiError("offline", "Sin conexión.");
});

beforeEach(async () => {
  files.clear();
  online = true;
  await source.reset();
});

const question = (overrides: Partial<SurveyQuestion>): SurveyQuestion => ({
  id: "q",
  type: "open_text",
  prompt: "¿?",
  required: true,
  options: [],
  ...overrides,
});

describe("validation", () => {
  it("requires required questions and accepts empty optional ones", () => {
    expect(validateAnswer(question({}), undefined)).toBe("Esta pregunta es obligatoria.");
    expect(validateAnswer(question({}), "   ".trim())).toBe("Esta pregunta es obligatoria.");
    expect(validateAnswer(question({ required: false }), null)).toBeNull();
  });

  it("only accepts options from the list, and integers inside the scale", () => {
    const single = question({ type: "single_choice", options: [{ id: "a", label: "A" }] });
    expect(validateAnswer(single, "a")).toBeNull();
    expect(validateAnswer(single, "zzz")).toBe("Elige una opción.");
    const multiple = question({ type: "multiple_choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
    expect(validateAnswer(multiple, ["a", "b"])).toBeNull();
    expect(validateAnswer(multiple, ["a", "x"])).toBe("Elige opciones de la lista.");
    const scale = question({ type: "scale", scale: { min: 1, max: 5 } });
    expect(validateAnswer(scale, 5)).toBeNull();
    expect(validateAnswer(scale, 6)).toBe("Elige un número del 1 al 5.");
    expect(validateAnswer(scale, 2.5)).toBe("Elige un número del 1 al 5.");
    expect(validateAnswer(question({}), "x".repeat(2001))).toMatch(/demasiado larga/);
  });

  it("validates a whole version and trims text answers for submission", async () => {
    const version = await source.getVersion("org-a", "fx-servicio", "fx-v-servicio-2");
    expect(Object.keys(validateAll(version, {}))).toEqual(["q1", "q3"]);
    expect(validateAll(version, { q1: "a", q3: 4 })).toEqual({});
    expect(toSubmissionAnswers(version, { q1: "a", q3: 4, q4: "  hola  " })).toEqual([
      { question_id: "q1", value: "a" },
      { question_id: "q2", value: null },
      { question_id: "q3", value: 4 },
      { question_id: "q4", value: "hola" },
    ]);
  });
});

describe("offline availability", () => {
  it("downloads a version explicitly and keeps the last inbox for offline viewing", async () => {
    const inbox = await refreshInbox(SCOPE, source);
    const assignment = inbox.assignments.find((value) => value.survey_id === "fx-servicio")!;
    expect(await getDownloaded(SCOPE, "fx-servicio")).toBeNull();
    await downloadVersion(SCOPE, source, assignment);

    online = false;
    await expect(refreshInbox(SCOPE, source)).rejects.toMatchObject({ kind: "offline" });
    expect((await cachedInbox(SCOPE))?.assignments).toHaveLength(3);
    expect((await getDownloaded(SCOPE, "fx-servicio"))?.version.id).toBe("fx-v-servicio-2");
    // Never visible to another organization of the same account.
    expect(await getDownloaded(OTHER, "fx-servicio")).toBeNull();
    expect(await cachedInbox(OTHER)).toBeNull();
  });

  it("cannot download while offline -- capture offline requires downloading first", async () => {
    const inbox = await refreshInbox(SCOPE, source);
    online = false;
    await expect(downloadVersion(SCOPE, source, inbox.assignments[0])).rejects.toMatchObject({ kind: "offline" });
  });
});

describe("drafts", () => {
  const draft: SurveyDraft = {
    id: "d-1",
    surveyId: "fx-servicio",
    versionId: "fx-v-servicio-2",
    surveyTitle: "Satisfacción",
    modality: "self_administered",
    respondentLabel: null,
    answers: { q1: "a" },
    recordingConsent: false,
    audio: null,
    updatedAt: "2026-10-12T10:00:00Z",
  };

  it("saves, resumes (after a restart the store is all there is) and deletes a draft", async () => {
    await saveDraft(SCOPE, draft);
    await saveDraft(SCOPE, { ...draft, answers: { q1: "b" } });
    expect((await listDrafts(SCOPE)).map((value) => value.id)).toEqual(["d-1"]);
    expect((await loadDraft(SCOPE, "d-1"))?.answers).toEqual({ q1: "b" });
    expect(await loadDraft(OTHER, "d-1")).toBeNull();
    await deleteDraft(SCOPE, "d-1");
    expect(await listDrafts(SCOPE)).toEqual([]);
  });
});

describe("sample server (fixture) behaviour the device relies on", () => {
  it("rejects responses to a closed survey with reason survey_closed", async () => {
    await expect(
      source.submitResponse("org-a", {
        client_response_id: "r-closed",
        survey_id: "fx-cerrada",
        version_id: "fx-v-cerrada-1",
        modality: "self_administered",
        respondent_label: null,
        answers: [],
        completed_at: "2026-10-12T10:00:00Z",
        recording_consent: false,
        audio_expected: false,
      }),
    ).rejects.toMatchObject({ kind: "conflict", reason: "survey_closed" });
  });

  it("stays idempotent across an app restart", async () => {
    const submission = {
      client_response_id: "r-1",
      survey_id: "fx-servicio",
      version_id: "fx-v-servicio-2",
      modality: "self_administered" as const,
      respondent_label: null,
      answers: [],
      completed_at: "2026-10-12T10:00:00Z",
      recording_consent: false,
      audio_expected: false,
    };
    const first = await source.submitResponse("org-a", submission);
    const afterRestart = createFixtureSurveySource(async () => undefined);
    expect((await afterRestart.submitResponse("org-a", submission)).response_id).toBe(first.response_id);
  });
});
