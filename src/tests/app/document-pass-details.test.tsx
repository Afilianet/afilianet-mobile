import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { IdentityDocumentStep } from "../../components/compliance/steps/IdentityDocumentStep";
import type { ComplianceStep, DocumentProcessingResult } from "../../types/api";

const mockResult = {
  id: "result-pass",
  document_type: "mx_ine",
  status: "completed",
  verdict: "pass",
  extracted_fields: [{ name: "first_name", value: "JUAN", confidence: 0.96 }],
  confirmation_status: "pending",
  confirmation_required: true,
  confirmable_fields: ["first_name"],
} as DocumentProcessingResult;

jest.mock("../../hooks/useDocumentResult", () => ({
  useDocumentResult: () => ({ data: mockResult, isPending: false, isFetching: false, isError: false, refetch: jest.fn() }),
}));
jest.mock("../../state/OrganizationContext", () => ({
  useOrganization: () => ({ activeOrganization: { id: "org-a" } }),
}));
jest.mock("../../components/compliance/steps/DevelopmentStepSimulator", () => ({
  DevelopmentStepSimulator: () => null,
}));

it("keeps the completed document's extracted details accessible when the step passes", async () => {
  const step = {
    id: "step-1",
    status: "passed",
    configured_provider: "afilianet",
    provider_actionable: true,
  } as ComplianceStep;
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <IdentityDocumentStep step={step} attempt={jest.fn()} isPending={false} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Confirmado desde el documento")).toBeTruthy();
  expect(screen.getByText("Confirma tus datos")).toBeTruthy();
  expect(screen.getByDisplayValue("JUAN")).toBeTruthy();
});
