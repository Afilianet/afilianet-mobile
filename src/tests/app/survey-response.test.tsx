import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { deleteDraft, getDownloaded, loadDraft, saveDraft, type SurveyDraft } from "../../features/surveys/library";
import { enqueueResponse } from "../../features/surveys/outbox";
import type { SurveyQuestion, SurveyVersion } from "../../features/surveys/types";
import { removeItem } from "../../features/surveys/vault";
import SurveyResponseScreen from "../../app/survey-response/[draftId]";

// The first render pays the screen's cold module cost; on slow machines that alone can pass Jest's 10s default.
jest.setTimeout(30_000);

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ draftId: "d-1" }),
}));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
jest.mock("../../features/surveys/runtime", () => ({
  useSurveyScope: () => mockScope,
  surveySource: { kind: "fixture" },
  surveysPreviewEnabled: true,
}));

const mockRecorder = {
  phase: "idle" as string,
  elapsedMs: 0,
  message: null as string | null,
  canOpenSettings: false,
  start: jest.fn(),
  stop: jest.fn(),
  openSettings: jest.fn(),
};
jest.mock("../../features/surveys/useInterviewRecorder", () => ({
  useInterviewRecorder: () => mockRecorder,
  formatDuration: (ms: number) => `${Math.round(ms / 1000)}s`,
}));

jest.mock("../../features/surveys/library", () => {
  const actual = jest.requireActual("../../features/surveys/library");
  return { ...actual, loadDraft: jest.fn(), getDownloaded: jest.fn(), saveDraft: jest.fn(async () => undefined), deleteDraft: jest.fn(async () => undefined) };
});
jest.mock("../../features/surveys/outbox", () => ({ enqueueResponse: jest.fn(async () => undefined), audioName: (id: string) => `audio-${id}` }));
jest.mock("../../features/surveys/vault", () => ({
  removeItem: jest.fn(async () => undefined),
  scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
  StorageFullError: class extends Error {},
}));

const SCOPE = { userId: "user-1", organizationId: "org-a" };

function q(id: number, overrides: Partial<SurveyQuestion> & Pick<SurveyQuestion, "type" | "prompt">): SurveyQuestion {
  return { id, uuid: `q-${id}`, position: id - 1, required: false, scale_min: null, scale_max: null, number_min: null, number_max: null, options: [], ...overrides };
}

const INTERVIEW: SurveyVersion = {
  id: "v-1",
  survey_id: "s-1",
  version_number: 1,
  title: "Entrevista vecinal",
  instructions: "Lee cada pregunta en voz alta.",
  allows_self_response: true,
  allows_interview_response: true,
  audio_mode: "optional",
  consent_text: "Esta entrevista se grabará.",
  opens_at: null,
  closes_at: null,
  status: "published",
  questions: [
    q(1, { type: "single_choice", prompt: "¿Cuánto tiempo?", required: true, options: [{ id: 1, position: 0, label: "Poco" }, { id: 2, position: 1, label: "Mucho" }] }),
    q(2, { type: "number", prompt: "¿Cuántos años?", required: true, number_min: 0, number_max: 80 }),
    q(3, { type: "text", prompt: "¿Problema principal?" }),
  ],
};

function draft(overrides: Partial<SurveyDraft> = {}): SurveyDraft {
  return {
    id: "d-1",
    surveyId: "s-1",
    versionId: "v-1",
    surveyTitle: "Entrevista vecinal",
    respondentType: "interviewed_external",
    answers: {},
    consentAudio: null,
    audio: null,
    updatedAt: "2026-10-12T10:00:00Z",
    ...overrides,
  };
}

async function renderScreen() {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<SurveyResponseScreen />);
  });
  return screen;
}

async function press(screen: Awaited<ReturnType<typeof render>>, text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = { ...SCOPE };
  mockRecorder.phase = "idle";
  (loadDraft as jest.Mock).mockResolvedValue(draft());
  (getDownloaded as jest.Mock).mockResolvedValue({ version: INTERVIEW, downloadedAt: "2026-10-11T10:00:00Z" });
});

describe("Survey response: consent and recording (interviews only)", () => {
  it("shows the version's consent text before any microphone control, and states the decision is final", async () => {
    const screen = await renderScreen();
    expect(screen.getByText("Esta entrevista se grabará.")).toBeTruthy();
    expect(screen.getByText("La decisión queda registrada con la respuesta y no se puede cambiar después.")).toBeTruthy();
    expect(screen.queryByText("Iniciar grabación")).toBeNull();
    await press(screen, "La persona acepta que se grabe");
    expect(screen.getByText("Iniciar grabación")).toBeTruthy();
    expect(mockRecorder.start).not.toHaveBeenCalled();
  });

  it("tells the surveyor what to explain when the version has no consent text", async () => {
    (getDownloaded as jest.Mock).mockResolvedValue({ version: { ...INTERVIEW, consent_text: null }, downloadedAt: "x" });
    const screen = await renderScreen();
    expect(screen.getByText(/no trae un texto de consentimiento/)).toBeTruthy();
  });

  it("never offers recording to a self response, even if the version records interviews", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ respondentType: "self" }));
    const screen = await renderScreen();
    expect(screen.queryByText("Consentimiento para grabar")).toBeNull();
    expect(screen.queryByText("Iniciar grabación")).toBeNull();
  });

  it("shows a visible recording indicator with a stop control, and does not save while recording", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", answers: { 1: [1], 2: "3" } }));
    mockRecorder.phase = "recording";
    mockRecorder.elapsedMs = 65000;
    const screen = await renderScreen();
    expect(screen.getByTestId("recording-indicator")).toBeTruthy();
    expect(screen.getByText("● Grabando · 65s")).toBeTruthy();
    await press(screen, "Guardar respuestas");
    expect(screen.getByText("Detén la grabación antes de guardar las respuestas.")).toBeTruthy();
    expect(enqueueResponse).not.toHaveBeenCalled();
    await press(screen, "Detener grabación");
    expect(mockRecorder.stop).toHaveBeenCalled();
  });

  it("a declined consent never sends audio and drops any local recording", async () => {
    const audio = { clientAudioId: "aud-1", mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: 10 };
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", audio, answers: { 1: [1], 2: "3" } }));
    const screen = await renderScreen();
    await press(screen, "Guardar respuestas");
    expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ consentAudio: "declined", audio: null }), expect.any(Array));
    expect(removeItem).toHaveBeenCalledWith(SCOPE, "audio-aud-1");
  });
});

describe("Survey response: completeness", () => {
  it("a self response must answer every required question", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ respondentType: "self" }));
    const screen = await renderScreen();
    await press(screen, "Guardar respuestas");
    expect(screen.getAllByText("Esta pregunta es obligatoria.")).toHaveLength(2);
    expect(enqueueResponse).not.toHaveBeenCalled();
  });

  it("an interview can be saved incomplete only after an explicit warning; omissions go as skipped", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", answers: { 1: [2] } }));
    const screen = await renderScreen();
    await press(screen, "Guardar respuestas");
    expect(enqueueResponse).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe("Hay preguntas obligatorias sin responder");
    expect(alert.mock.calls[0][1]).toMatch(/Falta 1 pregunta obligatoria/);

    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === "Guardar incompleta")?.onPress?.();
    });
    expect(enqueueResponse).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({ id: "d-1", respondentType: "interviewed_external", versionId: "v-1" }),
      [{ question_id: 1, value_choice_ids: [2] }, { question_id: 2, skipped: true }, { question_id: 3, skipped: true }],
    );
    expect(deleteDraft).toHaveBeenCalledWith(SCOPE, "d-1");
    expect(mockReplace).toHaveBeenCalledWith("/surveys");
  });

  it("still rejects a malformed answer in an interview (incomplete is allowed, wrong is not)", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", answers: { 1: [1], 2: "999" } }));
    const screen = await renderScreen();
    await press(screen, "Guardar respuestas");
    // Shown as the field's hint and, now, as an alert-role error.
    const alerts = screen.getAllByRole("alert").map((node) => node.props.children);
    expect(alerts).toContain("Escribe un número del 0 al 80.");
    expect(enqueueResponse).not.toHaveBeenCalled();
  });

  it("saves a complete interview with its audio and consent", async () => {
    const audio = { clientAudioId: "aud-1", mimeType: "audio/mp4", durationMs: 4000, interrupted: true, bytes: 10 };
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", audio }));
    const screen = await renderScreen();
    await press(screen, "Mucho");
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Tu respuesta (número)"), "7,5");
    });
    await press(screen, "Guardar respuestas");
    expect(enqueueResponse).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({ consentAudio: "accepted", audio }),
      [{ question_id: 1, value_choice_ids: [2] }, { question_id: 2, value_number: 7.5 }, { question_id: 3, skipped: true }],
    );
  });
});

describe("Survey response: session safety", () => {
  it("stops reading and writing the draft after a switch to another organization", async () => {
    const screen = await renderScreen();
    mockScope = { userId: "user-1", organizationId: "org-b" };
    (loadDraft as jest.Mock).mockResolvedValue(null);
    await act(async () => {
      screen.rerender(<SurveyResponseScreen />);
    });
    expect(screen.getByText("Este borrador ya no está en el teléfono.")).toBeTruthy();
    expect(saveDraft).not.toHaveBeenCalledWith({ userId: "user-1", organizationId: "org-b" }, expect.anything());
    expect(enqueueResponse).not.toHaveBeenCalled();
  });
});
