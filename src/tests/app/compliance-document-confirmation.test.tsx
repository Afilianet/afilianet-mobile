import { render } from "@testing-library/react-native";
import { DocumentResultView } from "../../components/compliance/document-capture/DocumentResultView";
import type { DocumentProcessingResult } from "../../types/api";

const result = {
  id: "result-1",
  document_type: "mx_ine",
  status: "completed",
  verdict: "pass",
  confirmation_status: "pending",
  extracted_fields: [
    { name: "first_name", value: "JUAN", confidence: 0.97 },
    { name: "curp", value: "PEGJ900515HDFRZN08", confidence: 0.79 },
  ],
} as DocumentProcessingResult;

it("shows extracted identity values as read-only and leaves correction to staff", () => {
  const screen = render(<DocumentResultView result={result} onRetry={jest.fn()} retrying={false} />);
  expect(screen.getByText("JUAN")).toBeTruthy();
  expect(screen.getByText("PEGJ900515HDFRZN08")).toBeTruthy();
  expect(screen.getByText(/equipo lo revisará desde el panel administrativo/i)).toBeTruthy();
  expect(screen.queryByText("Confirmar datos")).toBeNull();
  expect(screen.queryByDisplayValue("JUAN")).toBeNull();
});

it("keeps previously confirmed values read-only", () => {
  const screen = render(<DocumentResultView result={{ ...result, confirmation_status: "confirmed", confirmed_fields: { first_name: "JUAN" } }}
    onRetry={jest.fn()} retrying={false} />);
  expect(screen.getByText("JUAN")).toBeTruthy();
  expect(screen.queryByText("Confirmar datos")).toBeNull();
});
