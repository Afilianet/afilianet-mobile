import type { AudioConfig, AvailableSurvey, ResponseReceipt, ResponseSubmission, SurveyVersion } from "./types";

/**
 * Everything Mobile needs from the server for surveys (contract: API
 * feat/survey-module @ aa94798). Every call names the organization; callers
 * bind it to the session it started in (captureApiSessionGuard), so nothing
 * is fetched or sent under another account or organization.
 *
 * Contract rules the device relies on:
 * - submitResponse is idempotent on (version, client_response_id): a repeat
 *   returns the ORIGINAL response, 201 both times.
 * - Closed version (archived, superseded, or outside opens_at/closes_at):
 *   422 reason "survey_version_closed"; stored server-side as rejected_closed;
 *   never retried automatically.
 * - Audio needs an accepted consent and an existing response (answers first):
 *   upload session -> PUT to the presigned URL -> complete (idempotent). An
 *   interrupted upload restarts from a NEW session; there is no byte-range resume.
 * - Transcription and quality analysis run on the server after the audio lands.
 */
export interface SurveySource {
  /** "fixture" = sample data shown as a preview; "api" = afilianet-api. */
  readonly kind: "fixture" | "api";
  /**
   * Where what this source reads and receives belongs (origin.ts): "fixture",
   * or one API server's normalized identity. A stored record is only ever sent
   * through a source with exactly its origin.
   */
  readonly origin: string;
  listAvailable(organizationId: string): Promise<AvailableSurvey[]>;
  getVersion(organizationId: string, versionId: string): Promise<SurveyVersion>;
  submitResponse(organizationId: string, versionId: string, submission: ResponseSubmission): Promise<ResponseReceipt>;
  getAudioConfig(organizationId: string): Promise<AudioConfig>;
  /**
   * Session -> upload -> complete. Resolves only once the server confirmed the object.
   * `assertCurrent` throws once the session or organization changed; it runs
   * before every step, so a confirmation never goes out under another account.
   */
  uploadAudio(
    organizationId: string,
    input: { responseId: string; mimeType: string; bytes: Uint8Array; durationSeconds: number; interrupted: boolean },
    assertCurrent: () => void,
  ): Promise<void>;
}
