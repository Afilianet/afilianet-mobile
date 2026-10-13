import { ApiError } from "../../api/errors";
import { createFixtureSurveySource } from "./fixtureSource";
import {
  audioApplies,
  cachedInbox,
  deleteDraft,
  downloadVersion,
  getDownloaded,
  listDrafts,
  loadDraft,
  missingRequired,
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
  id: 1,
  uuid: "q",
  position: 0,
  type: "text",
  prompt: "¿?",
  required: true,
  scale_min: null,
  scale_max: null,
  number_min: null,
  number_max: null,
  options: [],
  ...overrides,
});

describe("validation (client-side; the server never rejects ranges or omissions)", () => {
  it("requires required questions only when asked to", () => {
    expect(validateAnswer(question({}), undefined)).toBe("Esta pregunta es obligatoria.");
    expect(validateAnswer(question({}), "   ")).toBe("Esta pregunta es obligatoria.");
    expect(validateAnswer(question({}), undefined, false)).toBeNull();
    expect(validateAnswer(question({ required: false }), null)).toBeNull();
  });

  it("checks choices against the option ids, and scale as an inclusive integer", () => {
    const options = [{ id: 1, position: 0, label: "A" }, { id: 2, position: 1, label: "B" }];
    expect(validateAnswer(question({ type: "single_choice", options }), [2])).toBeNull();
    expect(validateAnswer(question({ type: "single_choice", options }), [1, 2])).toBe("Elige una opción.");
    expect(validateAnswer(question({ type: "multiple_choice", options }), [1, 9])).toBe("Elige opciones de la lista.");
    const scale = question({ type: "scale", scale_min: 1, scale_max: 10 });
    expect(validateAnswer(scale, 10)).toBeNull();
    expect(validateAnswer(scale, 11)).toBe("Elige un número del 1 al 10.");
    expect(validateAnswer(scale, 2.5)).toBe("Elige un número del 1 al 10.");
  });

  it("accepts number as a decimal with up to 2 places, inclusive bounds, typed with a comma or a dot", () => {
    const years = question({ type: "number", number_min: 0, number_max: 80 });
    expect(validateAnswer(years, "7.5")).toBeNull();
    expect(validateAnswer(years, "7,25")).toBeNull();
    expect(validateAnswer(years, "80")).toBeNull();
    expect(validateAnswer(years, "7.555")).toBe("Escribe un número (con hasta 2 decimales).");
    expect(validateAnswer(years, "abc")).toBe("Escribe un número (con hasta 2 decimales).");
    expect(validateAnswer(years, "81")).toBe("Escribe un número del 0 al 80.");
  });
});

describe("submission answers", () => {
  it("maps each type to its own field and sends anything unanswered as skipped", async () => {
    const version = await source.getVersion("org-a", "fx-v-servicio-2");
    expect(toSubmissionAnswers(version, { 1: [2], 3: 4, 4: "7,5", 5: "  hola  " })).toEqual([
      { question_id: 1, value_choice_ids: [2] },
      { question_id: 2, skipped: true },
      { question_id: 3, value_number: 4 },
      { question_id: 4, value_number: 7.5 },
      { question_id: 5, value_text: "hola" },
    ]);
  });

  it("self responses must be complete; interviews may leave required questions as omissions", async () => {
    const self = await source.getVersion("org-a", "fx-v-servicio-2");
    expect(Object.keys(validateAll(self, {}))).toEqual(["1", "3"]);
    const interview = await source.getVersion("org-a", "fx-v-vecinal-1");
    expect(validateAll(interview, { 1: [1] }, false)).toEqual({});
    expect(missingRequired(interview, { 1: [1] }).map((value) => value.id)).toEqual([2, 3]);
  });

  it("only offers audio for interviews of versions that record it", async () => {
    const self = await source.getVersion("org-a", "fx-v-servicio-2");
    const interview = await source.getVersion("org-a", "fx-v-vecinal-1");
    expect(audioApplies(interview, "interviewed_external")).toBe(true);
    expect(audioApplies(interview, "self")).toBe(false);
    expect(audioApplies(self, "interviewed_external")).toBe(false); // audio_mode "none"
  });
});

describe("offline availability", () => {
  it("downloads a version explicitly and keeps the last inbox for offline viewing", async () => {
    const inbox = await refreshInbox(SCOPE, source);
    const servicio = inbox.surveys.find((value) => value.survey_id === "fx-servicio")!;
    expect(await getDownloaded(SCOPE, "fx-servicio")).toBeNull();
    await downloadVersion(SCOPE, source, servicio);

    online = false;
    await expect(refreshInbox(SCOPE, source)).rejects.toMatchObject({ kind: "offline" });
    expect((await cachedInbox(SCOPE))?.surveys).toHaveLength(2);
    expect((await getDownloaded(SCOPE, "fx-servicio"))?.version.id).toBe("fx-v-servicio-2");
    expect(await getDownloaded(OTHER, "fx-servicio")).toBeNull();
    expect(await cachedInbox(OTHER)).toBeNull();
  });

  it("cannot download while offline -- capture offline requires downloading first", async () => {
    const inbox = await refreshInbox(SCOPE, source);
    online = false;
    await expect(downloadVersion(SCOPE, source, inbox.surveys[0])).rejects.toMatchObject({ kind: "offline" });
  });

  it("drops a closed version from the inbox, like the API", async () => {
    await source.setClosed("fx-v-servicio-2", true);
    expect((await refreshInbox(SCOPE, source)).surveys.map((value) => value.survey_id)).toEqual(["fx-vecinal"]);
  });
});

describe("drafts", () => {
  const draft: SurveyDraft = {
    id: "d-1",
    surveyId: "fx-servicio",
    versionId: "fx-v-servicio-2",
    surveyTitle: "Satisfacción",
    respondentType: "self",
    answers: { 1: [1] },
    consentAudio: null,
    audio: null,
    updatedAt: "2026-10-12T10:00:00Z",
  };

  it("saves, resumes (after a restart the store is all there is) and deletes a draft", async () => {
    await saveDraft(SCOPE, draft);
    await saveDraft(SCOPE, { ...draft, answers: { 1: [2] } });
    expect((await listDrafts(SCOPE)).map((value) => value.id)).toEqual(["d-1"]);
    expect((await loadDraft(SCOPE, "d-1"))?.answers).toEqual({ 1: [2] });
    expect(await loadDraft(OTHER, "d-1")).toBeNull();
    await deleteDraft(SCOPE, "d-1");
    expect(await listDrafts(SCOPE)).toEqual([]);
  });
});

describe("sample source follows the contract's server rules", () => {
  const submission = {
    client_response_id: "c-1",
    respondent_type: "self" as const,
    submitted_at: "2026-10-12T10:00:00Z",
    consent_audio: null,
    consent_version: null,
    answers: [],
  };

  it("stays idempotent across an app restart", async () => {
    const first = await source.submitResponse("org-a", "fx-v-servicio-2", submission);
    const afterRestart = createFixtureSurveySource(async () => undefined);
    expect((await afterRestart.submitResponse("org-a", "fx-v-servicio-2", submission)).id).toBe(first.id);
  });

  it("refuses a modality the version does not allow", async () => {
    await expect(source.submitResponse("org-a", "fx-v-vecinal-1", submission)).rejects.toMatchObject({ reason: "respondent_type_not_allowed" });
  });
});
