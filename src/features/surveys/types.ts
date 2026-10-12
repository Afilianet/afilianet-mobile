/**
 * PROVISIONAL survey shapes -- NOT an afilianet-api contract. No surveys
 * API exists or is planned yet (confirmed with the API session, Oct 12
 * 2026). Question/version/settings shapes mirror afilianet-admin's own
 * provisional types (feat/admin-surveys @ 265f3e5, src/lib/surveys/types.ts)
 * so both apps converge on one contract. When the real contract lands,
 * replace these field by field and delete what it does not define.
 */

export type QuestionType = "single_choice" | "multiple_choice" | "open_text" | "scale";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  /** Only meaningful for single_choice/multiple_choice; empty otherwise. */
  options: QuestionOption[];
  /** Only for "scale": inclusive bounds. */
  scale?: { min: number; max: number };
}

/** Self-administered is answered by the affiliate; interviewer is captured in person by an authorized interviewer. */
export type SurveyModality = "self_administered" | "interviewer";

/** One immutable, published questionnaire version -- what is downloaded for offline use. */
export interface SurveyVersion {
  id: string;
  survey_id: string;
  version: number;
  title: string;
  questions: SurveyQuestion[];
  modality: SurveyModality;
  recording: { enabled: boolean; consent_text: string };
  closes_at: string | null;
}

/** What the inbox lists for the current account in the current organization. */
export interface SurveyAssignment {
  survey_id: string;
  organization_id: string;
  title: string;
  current_version_id: string;
  current_version: number;
  modality: SurveyModality;
  status: "open" | "closed";
  closes_at: string | null;
  /** Server decision: this account may run in-person interviews for this survey. */
  interviewer_authorized: boolean;
}

export type AnswerValue = string | string[] | number | null;

export interface SurveyAnswer {
  question_id: string;
  value: AnswerValue;
}

export interface ResponseSubmission {
  /** Generated on the device once; the server must treat repeats as the same response. */
  client_response_id: string;
  survey_id: string;
  version_id: string;
  modality: SurveyModality;
  /** Only for interviews: a label the interviewer typed, never required to be a real name. */
  respondent_label: string | null;
  answers: SurveyAnswer[];
  /** When the answers were completed on the device (not when they were sent). */
  completed_at: string;
  recording_consent: boolean;
  /** Whether an audio file will follow for this response. */
  audio_expected: boolean;
}

export interface ResponseReceipt {
  response_id: string;
  received_at: string;
}

export interface AudioReceipt {
  received_at: string;
}
