import { act, fireEvent, render } from "@testing-library/react-native";
import { deleteDraft, getDownloaded, loadDraft, saveDraft, type SurveyDraft } from "../../features/surveys/library";
import { enqueueResponse } from "../../features/surveys/outbox";
import type { SurveyVersion } from "../../features/surveys/types";
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
  removeItem: jest.fn(),
  scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
  StorageFullError: class extends Error {},
}));

const INTERVIEW: SurveyVersion = {
  id: "v-1",
  survey_id: "s-1",
  version: 1,
  title: "Entrevista vecinal",
  modality: "interviewer",
  closes_at: null,
  recording: { enabled: true, consent_text: "Esta entrevista se grabará." },
  questions: [
    { id: "q1", type: "single_choice", prompt: "¿Cuánto tiempo?", required: true, options: [{ id: "a", label: "Poco" }, { id: "b", label: "Mucho" }] },
    { id: "q2", type: "open_text", prompt: "¿Problema principal?", required: false, options: [] },
  ],
};

const DRAFT: SurveyDraft = {
  id: "d-1",
  surveyId: "s-1",
  versionId: "v-1",
  surveyTitle: "Entrevista vecinal",
  modality: "interviewer",
  respondentLabel: null,
  answers: {},
  recordingConsent: null,
  audio: null,
  updatedAt: "2026-10-12T10:00:00Z",
};

async function renderScreen() {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<SurveyResponseScreen />);
  });
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = { userId: "user-1", organizationId: "org-a" };
  mockRecorder.phase = "idle";
  (loadDraft as jest.Mock).mockResolvedValue(DRAFT);
  (getDownloaded as jest.Mock).mockResolvedValue({ version: INTERVIEW, downloadedAt: "2026-10-11T10:00:00Z" });
});

describe("Survey response", () => {
  it("asks for recording consent before any microphone control appears", async () => {
    const screen = await renderScreen();
    expect(screen.getByText("Consentimiento para grabar")).toBeTruthy();
    expect(screen.getByText("Esta entrevista se grabará.")).toBeTruthy();
    expect(screen.queryByText("Iniciar grabación")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("La persona acepta que se grabe"));
    });
    expect(screen.getByText("Iniciar grabación")).toBeTruthy();
    expect(mockRecorder.start).not.toHaveBeenCalled();
  });

  it("never offers recording when the person declines", async () => {
    const screen = await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText("Continuar sin grabar"));
    });
    expect(screen.queryByText("Iniciar grabación")).toBeNull();
    expect(screen.queryByText("Consentimiento para grabar")).toBeNull();
  });

  it("shows a visible recording indicator with a stop control", async () => {
    (loadDraft as jest.Mock).mockResolvedValue({ ...DRAFT, recordingConsent: true });
    mockRecorder.phase = "recording";
    mockRecorder.elapsedMs = 65000;
    const screen = await renderScreen();
    expect(screen.getByTestId("recording-indicator")).toBeTruthy();
    expect(screen.getByText("● Grabando · 65s")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Detener grabación"));
    });
    expect(mockRecorder.stop).toHaveBeenCalled();
  });

  it("does not save while recording", async () => {
    (loadDraft as jest.Mock).mockResolvedValue({ ...DRAFT, recordingConsent: true, answers: { q1: "a" } });
    mockRecorder.phase = "recording";
    const screen = await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText("Guardar respuestas"));
    });
    expect(screen.getByText("Detén la grabación antes de guardar las respuestas.")).toBeTruthy();
    expect(enqueueResponse).not.toHaveBeenCalled();
  });

  it("blocks saving with missing required answers and marks them", async () => {
    (loadDraft as jest.Mock).mockResolvedValue({ ...DRAFT, recordingConsent: false });
    const screen = await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText("Guardar respuestas"));
    });
    expect(screen.getByText("Esta pregunta es obligatoria.")).toBeTruthy();
    expect(screen.getByText("Revisa las preguntas marcadas antes de guardar.")).toBeTruthy();
    expect(enqueueResponse).not.toHaveBeenCalled();
  });

  it("saves to the device outbox with the draft's id and audio, then removes only the draft", async () => {
    const audio = { clientAudioId: "aud-1", mimeType: "audio/mp4", durationMs: 4000, interrupted: true, bytes: 10 };
    (loadDraft as jest.Mock).mockResolvedValue({ ...DRAFT, recordingConsent: true, audio, respondentLabel: " Entrevista 3 " });
    const screen = await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Mucho"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Guardar respuestas"));
    });

    expect(enqueueResponse).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-a" },
      expect.objectContaining({ id: "d-1", respondentLabel: "Entrevista 3", recordingConsent: true, audio }),
      [{ question_id: "q1", value: "b" }, { question_id: "q2", value: null }],
    );
    expect(deleteDraft).toHaveBeenCalledWith({ userId: "user-1", organizationId: "org-a" }, "d-1");
    expect(mockReplace).toHaveBeenCalledWith("/surveys");
  });

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
