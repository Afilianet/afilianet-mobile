/**
 * Survey shapes mirroring afilianet-api's contract field by field:
 * feat/survey-module @ c390e46, docs/surveys/SURVEY_CONTRACT.md (reconciled
 * with Admin #37 and this Mobile PR). Not merged or deployed on the API side
 * yet. Success bodies are wrapped in {data}; errors are flat {message, reason}.
 */

export type QuestionType = "single_choice" | "multiple_choice" | "text" | "number" | "scale";

export interface QuestionOption {
  id: number;
  position: number;
  label: string;
}

export interface SurveyQuestion {
  id: number;
  uuid: string;
  position: number;
  type: QuestionType;
  prompt: string;
  required: boolean;
  /** scale: integer, inclusive. Client-side rendering/validation only; the server never rejects out-of-range. */
  scale_min: number | null;
  scale_max: number | null;
  /** number: decimal (2 places), inclusive. Same: client-side only. */
  number_min: number | null;
  number_max: number | null;
  options: QuestionOption[];
}

/** Only meaningful for interviewed_external responses; a self response never has audio. */
export type AudioMode = "none" | "optional" | "required";

export type VersionStatus = "draft" | "published" | "superseded" | "archived";

/** SurveyVersionResource -- the full questionnaire, downloaded for offline capture. */
export interface SurveyVersion {
  id: string;
  survey_id: string;
  version_number: number;
  title: string;
  instructions: string | null;
  allows_self_response: boolean;
  allows_interview_response: boolean;
  audio_mode: AudioMode;
  /** The exact text a surveyor reads aloud before recording. */
  consent_text: string | null;
  opens_at: string | null;
  closes_at: string | null;
  status: VersionStatus;
  questions: SurveyQuestion[];
}

/** GET /surveys/available -- versions open for responses right now; closed ones simply disappear. */
export interface AvailableSurvey {
  survey_id: string;
  /** The version id. */
  id: string;
  version_number: number;
  title: string;
  status: VersionStatus;
  closes_at: string | null;
  allows_self_response: boolean;
  allows_interview_response: boolean;
  /** For the CALLING user: may they capture interviews? */
  is_assigned_surveyor: boolean;
}

export type RespondentType = "self" | "interviewed_external";
export type ConsentAudio = "accepted" | "declined";

/** Exactly one value field per answer, by question type; or skipped. */
export interface SurveyAnswer {
  question_id: number;
  value_choice_ids?: number[];
  value_text?: string;
  value_number?: number;
  skipped?: true;
}

export interface ResponseSubmission {
  /** Generated once on the device when the respondent finishes; the idempotency key. */
  client_response_id: string;
  respondent_type: RespondentType;
  /** Capture time on the device (may be long before sync). */
  submitted_at: string;
  consent_audio: ConsentAudio | null;
  consent_version: string | null;
  answers: SurveyAnswer[];
}

/** 201 SurveyResponseResource (minimal shape). A duplicate client_response_id returns the original, 201 too. */
export interface ResponseReceipt {
  id: string;
  survey_version_id: string;
  client_response_id: string;
  respondent_type: RespondentType;
  status: string;
  submitted_at: string;
  received_at: string;
  consent_audio: ConsentAudio | "not_applicable";
}

/** GET /surveys/audio-config -- read live, never hardcoded. */
export interface AudioConfig {
  max_bytes: number;
  allowed_mime_types: string[];
  upload_url_expiry_seconds: number;
}

export interface AudioUploadSession {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  expires_at: string;
}
