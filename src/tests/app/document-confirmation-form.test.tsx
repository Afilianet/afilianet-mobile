import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { DocumentConfirmationForm } from "../../components/compliance/document-capture/DocumentConfirmationForm";
import { useConfirmDocumentResult } from "../../hooks/useConfirmDocumentResult";
import type { DocumentProcessingResult } from "../../types/api";

jest.mock("../../hooks/useConfirmDocumentResult", () => ({ useConfirmDocumentResult: jest.fn() }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const submit = jest.fn();
const mockedUseConfirm = useConfirmDocumentResult as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseConfirm.mockReturnValue({ mutateAsync: submit, isPending: false });
  submit.mockResolvedValue({});
});

it("renders a blank CURP from the server allowlist and submits it without invented OCR fields", async () => {
  const result = {
    document_type: "mx_ine",
    verdict: "review",
    confirmable_fields: ["first_name", "curp"],
    extracted_fields: [
      { name: "first_name", value: "JUAN", confidence: 0.9, confirmation_required: true },
      { name: "full_name", value: "JUAN", confidence: 0.9, confirmation_required: false },
    ],
  } as DocumentProcessingResult;
  const screen = await render(<DocumentConfirmationForm stepId="step-1" result={result} />);

  expect(screen.getByLabelText("CURP").props.value).toBe("");
  expect(screen.queryByLabelText("Nombre completo")).toBeNull();
  await act(async () => fireEvent.changeText(screen.getByLabelText("CURP"), "PEGJ900515HDFRZN08"));
  await act(async () => fireEvent.press(screen.getByText("Confirmar datos")));

  await waitFor(() => expect(submit).toHaveBeenCalledWith({ first_name: "JUAN", curp: "PEGJ900515HDFRZN08" }));
});
