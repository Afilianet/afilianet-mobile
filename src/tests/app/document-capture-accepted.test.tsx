import { render } from "@testing-library/react-native";
import { DocumentResultView } from "../../components/compliance/document-capture/DocumentResultView";
import type { DocumentProcessingResult } from "../../types/api";

it("keeps accepted ID photos saved while OCR is pending and opens biometrics", () => {
  const result = {
    id: "capture-1",
    document_type: "mx_ine",
    status: "pending",
    verdict: null,
    capture_accepted: true,
    extracted_fields: [],
  } as DocumentProcessingResult;
  const retry = jest.fn();
  const screen = render(
    <DocumentResultView stepId="step-1" result={result} onRetry={retry} retrying={false} />,
  );

  expect(screen.getByText("Fotos de identificación guardadas")).toBeTruthy();
  expect(screen.getByText(/continuar con la prueba de vida/i)).toBeTruthy();
  expect(screen.queryByText("Tomar nuevas fotos")).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});
