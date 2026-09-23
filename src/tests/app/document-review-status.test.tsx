import { fireEvent, render } from "@testing-library/react-native";
import { ComplianceStepCard } from "../../components/compliance/ComplianceStepCard";
import { DocumentResultView } from "../../components/compliance/document-capture/DocumentResultView";
import { verdictCopy } from "../../components/compliance/document-capture/documentCaptureCopy";
import type { ComplianceStep, DocumentProcessingResult } from "../../types/api";

jest.mock("../../components/compliance/steps/IdentityDocumentStep", () => ({
  IdentityDocumentStep: () => null,
}));
jest.mock("../../components/compliance/document-capture/DocumentConfirmationForm", () => ({
  DocumentConfirmationForm: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>Formulario de confirmación</Text>;
  },
}));
jest.mock("../../hooks/useAttemptComplianceStep", () => ({
  useAttemptComplianceStep: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const reviewStep = {
  id: "step-1",
  step_type: "identity_document",
  status: "failed",
  configured_provider: "afilianet",
  provider_actionable: true,
  provider_unavailable_reason: null,
  completed_at: null,
  attempt_count: 1,
  provider: "afilianet",
  score: 0.5,
  created_at: "2026-01-01T00:00:00Z",
} as ComplianceStep;

const reviewResult = {
  id: "result-1",
  document_type: "mx_ine",
  status: "completed",
  verdict: "review",
  confidence: 0.9,
  validation_checks: [],
  quality: null,
  confirmation_required: true,
  confirmation_status: "confirmed",
  confirmed_fields: { curp: "PEGJ900515HDFRZN08" },
  extracted_fields: [],
  failure_reason: null,
  processor_version: "afilianet-document-engine-1",
  attempt_number: 1,
  started_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
} as DocumentProcessingResult;

it("uses a retry status for an inconclusive document instead of a rejection", async () => {
  const screen = await render(<ComplianceStepCard step={reviewStep} currentStep="identity_document" />);
  expect(screen.getByText("Otro intento necesario")).toBeTruthy();
  expect(screen.queryByText("Rechazado")).toBeNull();
});

it("keeps confirmed fields and an actionable new-capture button after an inconclusive result", async () => {
  const onRetry = jest.fn();
  const screen = await render(
    <DocumentResultView stepId="step-1" result={reviewResult} onRetry={onRetry} retrying={false} hideReviewBadge />,
  );
  expect(screen.getByText("Tus datos confirmados")).toBeTruthy();
  expect(screen.getByText(/tus datos quedaron guardados, pero este intento no verificó el documento/i)).toBeTruthy();
  expect(screen.queryByText("No concluyente")).toBeNull();
  fireEvent.press(screen.getByText("Tomar nuevas fotos"));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(verdictCopy("review").tone).toBe("warning");
});

it("asks for new photos when an INE has no readable name, instead of offering confirmation", async () => {
  const result = {
    ...reviewResult,
    id: "result-without-name",
    confirmation_status: "pending",
    confirmed_fields: null,
    extracted_fields: [
      { name: "address_raw", value: "Domicilio legible", confidence: 0.46 },
      { name: "address_postal_code", value: "01000", confidence: 0.93 },
    ],
  } as DocumentProcessingResult;
  const screen = await render(
    <DocumentResultView stepId="step-1" result={result} onRetry={jest.fn()} retrying={false} />,
  );
  expect(screen.getByText(/no pudimos leer tu nombre/i)).toBeTruthy();
  expect(screen.getByText("Tomar nuevas fotos")).toBeTruthy();
  expect(screen.queryByText("Formulario de confirmación")).toBeNull();
});
