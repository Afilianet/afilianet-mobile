import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert, StyleSheet } from "react-native";
import { deleteDraft, getDownloaded, loadDraft, saveDraft, type SurveyDraft } from "../../features/surveys/library";
import { enqueueResponse } from "../../features/surveys/outbox";
import type { SurveyQuestion, SurveyVersion } from "../../features/surveys/types";
import { removeItem } from "../../features/surveys/vault";
import SurveyResponseScreen from "../../app/survey-response/[draftId]";

// The first render pays the screen's cold module cost; on slow machines that alone can pass Jest's 10s default.
jest.setTimeout(30_000);

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: mockBack, canGoBack: () => true }),
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
  mockRecorder.message = null;
  mockRecorder.canOpenSettings = false;
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
    await press(screen, "Enviar respuesta");
    expect(screen.getByText("Detén la grabación antes de enviar las respuestas.")).toBeTruthy();
    expect(enqueueResponse).not.toHaveBeenCalled();
    // Leaving is blocked too: the recording must finish into the draft first.
    await press(screen, "Guardar borrador y salir");
    expect(screen.getByText("Detén la grabación antes de salir. Lo grabado se conservará en el borrador.")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await press(screen, "Detener grabación");
    expect(mockRecorder.stop).toHaveBeenCalled();
  });

  it("optional audio on an APK without the microphone module: explains it, offers no record button, and sends the interview without audio", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", answers: { 1: [1], 2: "3" } }));
    mockRecorder.phase = "unavailable";
    mockRecorder.message = "Esta versión de la app no puede grabar audio.";
    const screen = await renderScreen();
    expect(screen.getByText("Esta versión de la app no puede grabar audio.")).toBeTruthy();
    expect(screen.getByText("Puedes continuar la entrevista sin audio.")).toBeTruthy();
    expect(screen.queryByText("Iniciar grabación")).toBeNull();
    await press(screen, "Enviar respuesta");
    expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ consentAudio: "accepted", audio: null }), expect.any(Array));
  });

  it("a declined consent never sends audio and drops any local recording", async () => {
    const audio = { clientAudioId: "aud-1", mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: 10 };
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", audio, answers: { 1: [1], 2: "3" } }));
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
    expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ consentAudio: "declined", audio: null }), expect.any(Array));
    expect(removeItem).toHaveBeenCalledWith(SCOPE, "audio-aud-1");
  });
});

describe("Survey response: audio_mode required (contract: a decline is allowed; an accepted consent needs its recording)", () => {
  const REQUIRED: SurveyVersion = { ...INTERVIEW, audio_mode: "required" };
  const ANSWERED = { 1: [1], 2: "3" };
  const AUDIO = { clientAudioId: "aud-1", mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: 10 };

  beforeEach(() => {
    (getDownloaded as jest.Mock).mockResolvedValue({ version: REQUIRED, downloadedAt: "2026-10-11T10:00:00Z" });
  });

  async function expectKeptAsDraft(screen: Awaited<ReturnType<typeof render>>, message: string) {
    await press(screen, "Enviar respuesta");
    expect(screen.getAllByText(message).length).toBeGreaterThan(0);
    expect(enqueueResponse).not.toHaveBeenCalled();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  }

  const REQUIRED_UNAVAILABLE =
    "Esta encuesta requiere la grabación y la persona la aceptó, pero esta versión de la app no puede grabar audio. Las respuestas se conservan como borrador: instala una versión de la app que pueda grabar para terminarla y enviarla.";
  const REQUIRED_MISSING =
    "Esta encuesta requiere la grabación y la persona la aceptó: graba el audio para poder enviarla. Mientras tanto, las respuestas se conservan como borrador.";

  it("module absent, before consent: says recording is required, that accepting keeps it a draft, and still offers declining", async () => {
    mockRecorder.phase = "unavailable";
    const screen = await renderScreen();
    expect(screen.getByText(/Esta encuesta requiere grabar la entrevista/)).toBeTruthy();
    expect(screen.getByText(/se conservarán como borrador hasta que instales una versión de la app que pueda grabar/)).toBeTruthy();
    expect(screen.getByText("Continuar sin grabar")).toBeTruthy();
  });

  it("module absent + accepted: keeps the draft, never sends it as complete, and explains a compatible APK is needed", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", answers: ANSWERED }));
    mockRecorder.phase = "unavailable";
    const screen = await renderScreen();
    expect(screen.queryByText("Iniciar grabación")).toBeNull();
    expect(screen.queryByText("Puedes continuar la entrevista sin audio.")).toBeNull();
    await expectKeptAsDraft(screen, REQUIRED_UNAVAILABLE);
  });

  it("permission denied + accepted: keeps the draft and offers settings, not \"continue without audio\"", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", answers: ANSWERED }));
    mockRecorder.phase = "denied";
    mockRecorder.message = "Sin permiso de micrófono no se puede grabar.";
    mockRecorder.canOpenSettings = true;
    const screen = await renderScreen();
    expect(screen.getByText("Abrir configuración")).toBeTruthy();
    expect(screen.queryByText("Puedes continuar la entrevista sin audio.")).toBeNull();
    await expectKeptAsDraft(screen, REQUIRED_MISSING);
  });

  it("failed recording + accepted: keeps the draft and lets the surveyor try again", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", answers: ANSWERED }));
    mockRecorder.phase = "failed";
    mockRecorder.message = "No se pudo grabar.";
    const screen = await renderScreen();
    expect(screen.getByText("Iniciar grabación")).toBeTruthy();
    await expectKeptAsDraft(screen, REQUIRED_MISSING);
  });

  it("deleted audio + accepted: once the recording is deleted, the interview is a draft again", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", audio: AUDIO, answers: ANSWERED }));
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    const screen = await renderScreen();
    await press(screen, "Borrar audio");
    expect(removeItem).toHaveBeenCalledWith(SCOPE, "audio-aud-1");
    await expectKeptAsDraft(screen, REQUIRED_MISSING);
    alert.mockRestore();
  });

  it("declined: sends the interview without audio, as the contract allows (flagged for staff, never coerced)", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", answers: ANSWERED }));
    mockRecorder.phase = "unavailable";
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
    expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ consentAudio: "declined", audio: null }), expect.any(Array));
  });

  it("no consent decision yet: asks for one instead of reading silence as a decline", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: null, answers: ANSWERED }));
    const screen = await renderScreen();
    await expectKeptAsDraft(screen, "Registra si la persona acepta o no la grabación antes de guardar.");
  });

  it("accepted with its recording: sends the interview with the audio", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "accepted", audio: AUDIO, answers: ANSWERED }));
    mockRecorder.phase = "saved";
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
    expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ consentAudio: "accepted", audio: AUDIO }), expect.any(Array));
  });
});

describe("Survey response: completeness", () => {
  it("a self response must answer every required question", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ respondentType: "self" }));
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
    expect(screen.getAllByText("Esta pregunta es obligatoria.")).toHaveLength(2);
    expect(enqueueResponse).not.toHaveBeenCalled();
  });

  it("an interview can be saved incomplete only after an explicit warning; omissions go as skipped", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", answers: { 1: [2] } }));
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
    expect(enqueueResponse).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe("Hay preguntas obligatorias sin responder");
    expect(alert.mock.calls[0][1]).toMatch(/Falta 1 pregunta obligatoria/);

    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === "Enviar incompleta")?.onPress?.();
    });
    expect(enqueueResponse).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({ id: "d-1", respondentType: "interviewed_external", versionId: "v-1" }),
      [{ question_id: 1, value_choice_ids: [2] }, { question_id: 2, skipped: true }, { question_id: 3, skipped: true }],
    );
    expect(deleteDraft).toHaveBeenCalledWith(SCOPE, "d-1");
    // Back to what opened it: never a second copy of the list on the stack.
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("still rejects a malformed answer in an interview (incomplete is allowed, wrong is not)", async () => {
    (loadDraft as jest.Mock).mockResolvedValue(draft({ consentAudio: "declined", answers: { 1: [1], 2: "999" } }));
    const screen = await renderScreen();
    await press(screen, "Enviar respuesta");
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
    await press(screen, "Enviar respuesta");
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

describe("Survey response: open text answer", () => {
  // Tablet finding: the keyboard opened on the open question but the text was
  // not kept. The draft store below behaves like the real one: what is saved
  // is what a later visit to the screen loads.
  function useDraftStore(initial: SurveyDraft) {
    const store = new Map<string, SurveyDraft>([["user-1.org-a/d-1", initial]]);
    (loadDraft as jest.Mock).mockImplementation(async (scope: { userId: string; organizationId: string }, id: string) => store.get(`${scope.userId}.${scope.organizationId}/${id}`) ?? null);
    (saveDraft as jest.Mock).mockImplementation(async (scope: { userId: string; organizationId: string }, value: SurveyDraft) => {
      store.set(`${scope.userId}.${scope.organizationId}/${value.id}`, value);
    });
    return store;
  }

  async function typeEachCharacter(screen: Awaited<ReturnType<typeof render>>, text: string) {
    for (let length = 1; length <= text.length; length += 1) {
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText("Tu respuesta"), text.slice(0, length));
      });
    }
  }

  it("keeps every typed character in the field and autosaves it to the draft", async () => {
    jest.useFakeTimers();
    try {
      const store = useDraftStore(draft());
      const screen = await renderScreen();
      await typeEachCharacter(screen, "Buen servicio");
      expect(screen.getByLabelText("Tu respuesta").props.value).toBe("Buen servicio");
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(store.get("user-1.org-a/d-1")?.answers[3]).toBe("Buen servicio");
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps what was typed when leaving the screen before the autosave delay, and shows it again on return", async () => {
    jest.useFakeTimers();
    try {
      const store = useDraftStore(draft());
      const screen = await renderScreen();
      await typeEachCharacter(screen, "Hola");
      // Back within the 600 ms debounce: the visit ends (the old instance
      // unmounts) and a new visit mounts and loads the stored draft.
      await act(async () => {
        screen.rerender(<SurveyResponseScreen key="second-visit" />);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      expect(store.get("user-1.org-a/d-1")?.answers[3]).toBe("Hola");
      expect(screen.getByLabelText("Tu respuesta").props.value).toBe("Hola");
    } finally {
      jest.useRealTimers();
    }
  });

  it("never writes the typed text into another account or organization when the session changes", async () => {
    jest.useFakeTimers();
    try {
      const store = useDraftStore(draft());
      const screen = await renderScreen();
      await typeEachCharacter(screen, "Privado");
      mockScope = { userId: "user-2", organizationId: "org-b" };
      await act(async () => {
        screen.rerender(<SurveyResponseScreen key="other-session" />);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      // The other session never sees it either.
      expect(screen.queryByLabelText("Tu respuesta")).toBeNull();
      expect([...store.keys()]).toEqual(["user-1.org-a/d-1"]);
      for (const [, [scope]] of (saveDraft as jest.Mock).mock.calls.entries()) {
        expect(scope).toEqual(SCOPE);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("never recreates the draft after the response is submitted, even with an autosave still pending", async () => {
    jest.useFakeTimers();
    try {
      const store = useDraftStore(draft({ consentAudio: "declined", answers: { 1: [2], 2: "7" } }));
      (deleteDraft as jest.Mock).mockImplementation(async (scope: { userId: string; organizationId: string }, id: string) => {
        store.delete(`${scope.userId}.${scope.organizationId}/${id}`);
      });
      const screen = await renderScreen();
      await typeEachCharacter(screen, "Último comentario");
      await press(screen, "Enviar respuesta");
      expect(enqueueResponse).toHaveBeenCalledWith(SCOPE, expect.objectContaining({ id: "d-1" }), expect.arrayContaining([{ question_id: 3, value_text: "Último comentario" }]));
      await act(async () => {
        screen.rerender(<SurveyResponseScreen key="after-submit" />);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      expect(store.has("user-1.org-a/d-1")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("is a multi-line area tall enough to show the typed lines, not a single-line box", async () => {
    const screen = await renderScreen();
    const style = StyleSheet.flatten(screen.getByLabelText("Tu respuesta").props.style);
    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBeGreaterThanOrEqual(88);
    expect(style.textAlignVertical).toBe("top");
    // Single-line fields keep their 44 pt height.
    expect(StyleSheet.flatten(screen.getByLabelText("Tu respuesta (número)").props.style).height).toBe(44);
  });
});
