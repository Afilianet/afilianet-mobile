import { render } from "@testing-library/react-native";
import { friendlyFailureReason, isUnavailableFailureReason } from "../../components/compliance/document-capture/documentCaptureCopy";
import { FaceMatchResultView } from "../../components/compliance/face-match/FaceMatchResultView";
import { faceMatchFailureCopy, isTechnicalFaceMatchFailure } from "../../components/compliance/face-match/faceMatchCopy";
import { strings } from "../../i18n";
import type { FaceMatchProcessingResult } from "../../types/api";

/**
 * identity-engine #3 answers 503 `engine_busy` when a request cannot start
 * within its queue wait, and the API persists it as the failure_reason. It is
 * a transient technical failure like `timeout`/`engine_error`: never the
 * generic "something went wrong", and face match offers the retry with the
 * same pair. Synthetic results only.
 */
it("a document processed while the engine was busy reads as temporarily unavailable", () => {
  expect(isUnavailableFailureReason("engine_busy")).toBe(true);
  expect(friendlyFailureReason("engine_busy")).toBe(strings.documentCapture.failureReasons.unavailable);
});

it("a face match refused as busy is a technical failure with the same-photos retry", async () => {
  expect(isTechnicalFaceMatchFailure("engine_busy")).toBe(true);
  expect(faceMatchFailureCopy("engine_busy").message).toBe(strings.faceMatch.serviceUnavailable);

  const result = { id: "fm-sintetico", status: "failed", verdict: null, failure_reason: "engine_busy", attempt_number: 1 } as unknown as FaceMatchProcessingResult;
  const view = await render(<FaceMatchResultView result={result} onRetry={jest.fn()} onRetryExisting={jest.fn()} retrying={false} />);
  expect(view.getByText(strings.faceMatch.technicalFailureTitle)).toBeTruthy();
  expect(view.getByText(strings.faceMatch.retryExistingPhotos)).toBeTruthy();
  expect(view.queryByText(strings.faceMatch.couldNotProcess)).toBeNull();
});
