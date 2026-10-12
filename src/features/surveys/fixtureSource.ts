import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { ApiError } from "../../api/errors";
import { config } from "../../config/env";
import type { SurveySource } from "./source";
import type { AudioReceipt, ResponseReceipt, SurveyAssignment, SurveyVersion } from "./types";

/**
 * SAMPLE DATA, NOT A SERVER. afilianet-api has no surveys contract yet, so
 * this stands in for one -- exactly like afilianet-admin's
 * FixtureSurveySource -- and the UI always says so (SurveysPreviewNotice).
 * Nothing sent here leaves the phone.
 *
 * Two things are deliberately real so physical tests mean something:
 * - Connectivity: every call first reaches the configured API host. In
 *   airplane mode or with a flaky network it fails exactly like the real
 *   API would ("offline"/"timeout"), so the device queue is exercised.
 * - Idempotency: the simulated server remembers client_response_id and
 *   client_audio_id across app restarts (AsyncStorage), so a duplicate send
 *   returns the same response instead of creating another.
 */

const STATE_KEY = "afn.surveys.fixtureServer.v1";
const REACHABILITY_TIMEOUT_MS = 6000;

interface ServerState {
  responses: Record<string, { response_id: string; received_at: string; organization_id: string }>;
  audio: Record<string, { received_at: string; bytes: number }>;
  closed: string[];
}

const VERSIONS: SurveyVersion[] = [
  {
    id: "fx-v-servicio-2",
    survey_id: "fx-servicio",
    version: 2,
    title: "Satisfacción con el servicio (ejemplo)",
    modality: "self_administered",
    closes_at: null,
    recording: { enabled: false, consent_text: "" },
    questions: [
      { id: "q1", type: "single_choice", prompt: "¿Cómo calificas la atención que recibiste?", required: true, options: [
        { id: "a", label: "Muy buena" }, { id: "b", label: "Buena" }, { id: "c", label: "Regular" }, { id: "d", label: "Mala" },
      ] },
      { id: "q2", type: "multiple_choice", prompt: "¿Qué temas te interesan?", required: false, options: [
        { id: "salud", label: "Salud" }, { id: "empleo", label: "Empleo" }, { id: "seguridad", label: "Seguridad" },
      ] },
      { id: "q3", type: "scale", prompt: "Del 1 al 5, ¿qué tan probable es que nos recomiendes?", required: true, options: [], scale: { min: 1, max: 5 } },
      { id: "q4", type: "open_text", prompt: "¿Algo más que quieras contarnos?", required: false, options: [] },
    ],
  },
  {
    id: "fx-v-vecinal-1",
    survey_id: "fx-vecinal",
    version: 1,
    title: "Entrevista vecinal (ejemplo)",
    modality: "interviewer",
    closes_at: null,
    recording: {
      enabled: true,
      consent_text: "Esta entrevista se grabará en audio para revisar la calidad de las respuestas. La grabación es opcional: puedes contestar sin ella.",
    },
    questions: [
      { id: "q1", type: "single_choice", prompt: "¿Cuánto tiempo lleva viviendo en la colonia?", required: true, options: [
        { id: "a", label: "Menos de 1 año" }, { id: "b", label: "De 1 a 5 años" }, { id: "c", label: "Más de 5 años" },
      ] },
      { id: "q2", type: "open_text", prompt: "¿Cuál es el principal problema de la colonia?", required: true, options: [] },
      { id: "q3", type: "scale", prompt: "Del 1 al 10, ¿cómo califica los servicios públicos?", required: true, options: [], scale: { min: 1, max: 10 } },
    ],
  },
  {
    id: "fx-v-cerrada-1",
    survey_id: "fx-cerrada",
    version: 1,
    title: "Consulta de septiembre (ejemplo, cerrada)",
    modality: "self_administered",
    closes_at: "2026-09-30T23:59:59Z",
    recording: { enabled: false, consent_text: "" },
    questions: [{ id: "q1", type: "open_text", prompt: "¿Qué opinas?", required: true, options: [] }],
  },
];

const INITIALLY_CLOSED = ["fx-cerrada"];

async function loadState(): Promise<ServerState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as ServerState;
  } catch {
    // A broken sample store just starts over.
  }
  return { responses: {}, audio: {}, closed: [...INITIALLY_CLOSED] };
}

async function saveState(state: ServerState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** Real network check against the configured API host. */
export async function reachApiHost(timeoutMs = REACHABILITY_TIMEOUT_MS): Promise<void> {
  if (!config.apiBaseUrl) throw new ApiError("offline", "Sin conexión.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${config.apiBaseUrl}/up`, { method: "GET", signal: controller.signal });
  } catch {
    throw new ApiError(controller.signal.aborted ? "timeout" : "offline", "Sin conexión.");
  } finally {
    clearTimeout(timer);
  }
}

export function createFixtureSurveySource(reach: () => Promise<void> = () => reachApiHost()): SurveySource & {
  /** Sample-only control to exercise "the survey closed while you were offline". */
  setClosed(surveyId: string, closed: boolean): Promise<void>;
  reset(): Promise<void>;
} {
  function versionFor(surveyId: string): SurveyVersion {
    const version = VERSIONS.find((candidate) => candidate.survey_id === surveyId);
    if (!version) throw new ApiError("not_found", "No encontramos esta encuesta.", 404);
    return version;
  }

  return {
    kind: "fixture",

    async listAssignments(organizationId) {
      await reach();
      const state = await loadState();
      return VERSIONS.map<SurveyAssignment>((version) => ({
        survey_id: version.survey_id,
        organization_id: organizationId,
        title: version.title,
        current_version_id: version.id,
        current_version: version.version,
        modality: version.modality,
        status: state.closed.includes(version.survey_id) ? "closed" : "open",
        closes_at: version.closes_at,
        interviewer_authorized: version.modality === "interviewer",
      }));
    },

    async getVersion(_organizationId, surveyId, versionId) {
      await reach();
      const version = versionFor(surveyId);
      if (version.id !== versionId) throw new ApiError("not_found", "Esa versión ya no está disponible.", 404);
      return version;
    },

    async submitResponse(organizationId, submission): Promise<ResponseReceipt> {
      await reach();
      const state = await loadState();
      const existing = state.responses[submission.client_response_id];
      if (existing) {
        if (existing.organization_id !== organizationId) throw new ApiError("conflict", "Esta respuesta pertenece a otra organización.", 409);
        return { response_id: existing.response_id, received_at: existing.received_at };
      }
      if (state.closed.includes(submission.survey_id)) {
        throw new ApiError("conflict", "La encuesta ya cerró.", 409, undefined, { reason: "survey_closed" });
      }
      const receipt = { response_id: `fx-r-${randomUUID()}`, received_at: new Date().toISOString(), organization_id: organizationId };
      state.responses[submission.client_response_id] = receipt;
      await saveState(state);
      return { response_id: receipt.response_id, received_at: receipt.received_at };
    },

    async uploadAudio(_organizationId, input): Promise<AudioReceipt> {
      await reach();
      const state = await loadState();
      const known = Object.values(state.responses).some((response) => response.response_id === input.response_id);
      if (!known) throw new ApiError("not_found", "La respuesta de este audio no existe.", 404);
      const existing = state.audio[input.client_audio_id];
      if (existing) return { received_at: existing.received_at };
      const receipt = { received_at: new Date().toISOString(), bytes: input.bytes.byteLength };
      state.audio[input.client_audio_id] = receipt;
      await saveState(state);
      return { received_at: receipt.received_at };
    },

    async setClosed(surveyId, closed) {
      const state = await loadState();
      state.closed = closed ? [...new Set([...state.closed, surveyId])] : state.closed.filter((id) => id !== surveyId);
      await saveState(state);
    },

    async reset() {
      await AsyncStorage.removeItem(STATE_KEY);
    },
  };
}
