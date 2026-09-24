import { render } from "@testing-library/react-native";
import { DocumentResultView } from "../../components/compliance/document-capture/DocumentResultView";
import type { DocumentProcessingResult } from "../../types/api";

it("keeps accepted ID photos saved while OCR is pending and opens biometrics", async () => {
  const result: DocumentProcessingResult = {
    id: "capture-1",
    document_type: "mx_ine",
    status: "pending",
    verdict: null,
    capture_accepted: true,
    extracted_fields: [],
    confidence: null,
    validation_checks: [],
    quality: null,
    confirmed_fields: null,
    confirmation_required: false,
    confirmation_status: "not_required",
    failure_reason: null,
    processor_version: "afilianet-document-engine-1",
    attempt_number: 1,
    started_at: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const retry = jest.fn();
  const screen = await render(
    <DocumentResultView stepId="step-1" result={result} onRetry={retry} retrying={false} />,
  );

  expect(screen.getByText("Fotos de identificación guardadas")).toBeTruthy();
  expect(screen.getByText(/continuar con la prueba de vida/i)).toBeTruthy();
  expect(screen.queryByText("Tomar nuevas fotos")).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});
