import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { ApiError } from "../../api/errors";
import { config } from "../../config/env";
import type { SurveySource } from "./source";
import type { AudioConfig, AvailableSurvey, ResponseReceipt, SurveyQuestion, SurveyVersion } from "./types";

/**
 * SAMPLE DATA, NOT A SERVER. Used while afilianet-api's surveys module
 * (feat/survey-module @ c390e46) is not deployed; the UI always says so
 * (SurveysPreviewNotice). It follows that contract's shapes and rules
 * exactly, so the preview exercises what the real API will do -- but nothing
 * sent here leaves the phone, and passing tests against it does NOT validate
 * the surveys MVP.
 *
 * Deliberately real, so physical tests mean something:
 * - Connectivity: every call first reaches the configured API host, so
 *   airplane mode / a flaky network fail like the real API would.
 * - Idempotency: client_response_id is remembered across app restarts.
 */

const STATE_KEY = "afn.surveys.fixtureServer.v2";
const REACHABILITY_TIMEOUT_MS = 6000;
const AUDIO_CONFIG: AudioConfig = { max_bytes: 15 * 1024 * 1024, allowed_mime_types: ["audio/mp4", "audio/mpeg", "audio/x-m4a"], upload_url_expiry_seconds: 900 };

interface StoredResponse {
  receipt: ResponseReceipt;
  organization_id: string;
  consent: "accepted" | "declined" | "not_applicable";
}

interface ServerState {
  responses: Record<string, StoredResponse>;
  audio: Record<string, { bytes: number; duration_seconds: number; interrupted: boolean }>;
  closed: string[];
}

function question(id: number, overrides: Partial<SurveyQuestion> & Pick<SurveyQuestion, "type" | "prompt">): SurveyQuestion {
  return {
    id,
    uuid: `fx-q-${id}`,
    position: id - 1,
    required: false,
    scale_min: null,
    scale_max: null,
    number_min: null,
    number_max: null,
    options: [],
    ...overrides,
  };
}

const options = (...labels: string[]) => labels.map((label, index) => ({ id: index + 1, position: index, label }));

const VERSIONS: (SurveyVersion & { is_assigned_surveyor: boolean })[] = [
  {
    id: "fx-v-servicio-2",
    survey_id: "fx-servicio",
    version_number: 2,
    title: "Satisfacción con el servicio (ejemplo)",
    instructions: "Contesta con tu experiencia de los últimos 3 meses.",
    allows_self_response: true,
    allows_interview_response: false,
    audio_mode: "none",
    consent_text: null,
    opens_at: null,
    closes_at: null,
    status: "published",
    is_assigned_surveyor: false,
    questions: [
      question(1, { type: "single_choice", prompt: "¿Cómo calificas la atención que recibiste?", required: true, options: options("Muy buena", "Buena", "Regular", "Mala") }),
      question(2, { type: "multiple_choice", prompt: "¿Qué temas te interesan?", options: options("Salud", "Empleo", "Seguridad") }),
      question(3, { type: "scale", prompt: "Del 1 al 5, ¿qué tan probable es que nos recomiendes?", required: true, scale_min: 1, scale_max: 5 }),
      question(4, { type: "number", prompt: "¿Cuántos años llevas como afiliado?", number_min: 0, number_max: 80 }),
      question(5, { type: "text", prompt: "¿Algo más que quieras contarnos?" }),
    ],
  },
  {
    id: "fx-v-vecinal-1",
    survey_id: "fx-vecinal",
    version_number: 1,
    title: "Entrevista vecinal (ejemplo)",
    instructions: "Lee cada pregunta en voz alta a la persona entrevistada.",
    allows_self_response: false,
    allows_interview_response: true,
    audio_mode: "optional",
    consent_text: "Esta entrevista se grabará en audio para revisar la calidad de las respuestas. La grabación es opcional: puede contestar sin ella. ¿Autoriza la grabación?",
    opens_at: null,
    closes_at: null,
    status: "published",
    is_assigned_surveyor: true,
    questions: [
      question(1, { type: "single_choice", prompt: "¿Cuánto tiempo lleva viviendo en la colonia?", required: true, options: options("Menos de 1 año", "De 1 a 5 años", "Más de 5 años") }),
      question(2, { type: "text", prompt: "¿Cuál es el principal problema de la colonia?", required: true }),
      question(3, { type: "scale", prompt: "Del 1 al 10, ¿cómo califica los servicios públicos?", required: true, scale_min: 1, scale_max: 10 }),
    ],
  },
];

async function loadState(): Promise<ServerState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as ServerState;
  } catch {
    // A broken sample store just starts over.
  }
  return { responses: {}, audio: {}, closed: [] };
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

const closedError = () => new ApiError("validation", "La encuesta ya cerró.", 422, undefined, { reason: "survey_version_closed" });

export function createFixtureSurveySource(reach: () => Promise<void> = () => reachApiHost()): SurveySource & {
  /** Sample-only control: archive a version ("the survey closed while you were offline"). */
  setClosed(versionId: string, closed: boolean): Promise<void>;
  reset(): Promise<void>;
} {
  function versionFor(versionId: string) {
    const version = VERSIONS.find((candidate) => candidate.id === versionId);
    if (!version) throw new ApiError("not_found", "No encontramos esta encuesta.", 404);
    return version;
  }

  return {
    kind: "fixture",

    async listAvailable(): Promise<AvailableSurvey[]> {
      await reach();
      const state = await loadState();
      // Like the API: only versions open right now; a closed one simply disappears.
      return VERSIONS.filter((version) => !state.closed.includes(version.id)).map((version) => ({
        survey_id: version.survey_id,
        id: version.id,
        version_number: version.version_number,
        title: version.title,
        status: version.status,
        closes_at: version.closes_at,
        allows_self_response: version.allows_self_response,
        allows_interview_response: version.allows_interview_response,
        is_assigned_surveyor: version.is_assigned_surveyor,
      }));
    },

    async getVersion(_organizationId, versionId) {
      await reach();
      const { is_assigned_surveyor: _ignored, ...version } = versionFor(versionId);
      return version;
    },

    async submitResponse(organizationId, versionId, submission) {
      await reach();
      const state = await loadState();
      const key = `${versionId}:${submission.client_response_id}`;
      const existing = state.responses[key];
      if (existing) {
        if (existing.organization_id !== organizationId) throw new ApiError("not_found", "No encontrado.", 404);
        // Idempotent replay, including a replay of a rejected_closed one.
        if (existing.receipt.status === "rejected_closed") throw closedError();
        return existing.receipt;
      }
      const version = versionFor(versionId);
      if (submission.respondent_type === "self" && !version.allows_self_response) {
        throw new ApiError("validation", "Modalidad no permitida.", 422, undefined, { reason: "respondent_type_not_allowed" });
      }
      if (submission.respondent_type === "interviewed_external") {
        if (!version.allows_interview_response) throw new ApiError("validation", "Modalidad no permitida.", 422, undefined, { reason: "respondent_type_not_allowed" });
        if (!version.is_assigned_surveyor) throw new ApiError("forbidden", "No eres encuestador asignado.", 403, undefined, { reason: "not_assigned_surveyor" });
      }
      const closed = state.closed.includes(versionId);
      const consent = submission.respondent_type === "self" || version.audio_mode === "none" ? "not_applicable" : submission.consent_audio ?? "declined";
      const receipt: ResponseReceipt = {
        id: `fx-r-${randomUUID()}`,
        survey_version_id: versionId,
        client_response_id: submission.client_response_id,
        respondent_type: submission.respondent_type,
        status: closed ? "rejected_closed" : "submitted",
        submitted_at: submission.submitted_at,
        received_at: new Date().toISOString(),
        consent_audio: consent,
      };
      state.responses[key] = { receipt, organization_id: organizationId, consent };
      await saveState(state);
      if (closed) throw closedError();
      return receipt;
    },

    async getAudioConfig() {
      await reach();
      return AUDIO_CONFIG;
    },

    async uploadAudio(_organizationId, input) {
      await reach();
      const state = await loadState();
      const stored = Object.values(state.responses).find((value) => value.receipt.id === input.responseId);
      if (!stored) throw new ApiError("not_found", "La respuesta de este audio no existe.", 404);
      if (stored.consent !== "accepted") throw new ApiError("validation", "Sin consentimiento.", 422, undefined, { reason: "audio_consent_required" });
      if (!AUDIO_CONFIG.allowed_mime_types.includes(input.mimeType)) throw new ApiError("validation", "Tipo no permitido.", 422, undefined, { reason: "unsupported_mime_type" });
      if (input.bytes.byteLength > AUDIO_CONFIG.max_bytes) throw new ApiError("validation", "Demasiado grande.", 422, undefined, { reason: "object_too_large" });
      state.audio[input.responseId] = { bytes: input.bytes.byteLength, duration_seconds: input.durationSeconds, interrupted: input.interrupted };
      await saveState(state);
    },

    async setClosed(versionId, closed) {
      const state = await loadState();
      state.closed = closed ? [...new Set([...state.closed, versionId])] : state.closed.filter((value) => value !== versionId);
      await saveState(state);
    },

    async reset() {
      await AsyncStorage.removeItem(STATE_KEY);
    },
  };
}
