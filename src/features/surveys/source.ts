import type { AudioReceipt, ResponseReceipt, ResponseSubmission, SurveyAssignment, SurveyVersion } from "./types";

/**
 * Everything Mobile needs from the server for surveys, with no HTTP shape
 * baked in. Every call names the organization explicitly; the caller binds
 * it to the session it started in (captureApiSessionGuard), so nothing can
 * be fetched or sent under another account or organization.
 *
 * Contract requirements this interface encodes (to hand to afilianet-api):
 * - submitResponse is idempotent on client_response_id: a repeat returns the
 *   SAME response_id and never creates a second response.
 * - uploadAudio is idempotent on client_audio_id and only resolves once the
 *   server has durably stored the file; the device deletes its copy only then.
 * - Answers first, audio second: uploadAudio needs the response_id.
 * - A closed survey rejects with reason "survey_closed" (ApiError kind
 *   "conflict"); the device keeps the data and asks the person what to do.
 * - Transcription and analysis run on the server after the audio arrives;
 *   nothing on the device transcribes.
 */
export interface SurveySource {
  /** "fixture" until afilianet-api publishes the contract; the UI says so visibly. */
  readonly kind: "fixture" | "api";
  listAssignments(organizationId: string): Promise<SurveyAssignment[]>;
  getVersion(organizationId: string, surveyId: string, versionId: string): Promise<SurveyVersion>;
  submitResponse(organizationId: string, submission: ResponseSubmission): Promise<ResponseReceipt>;
  uploadAudio(
    organizationId: string,
    input: { response_id: string; client_audio_id: string; mime_type: string; bytes: Uint8Array; duration_ms: number; interrupted: boolean },
  ): Promise<AudioReceipt>;
}
