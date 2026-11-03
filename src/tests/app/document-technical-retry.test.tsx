import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  completeEvidenceUpload,
  fetchDocumentResult,
  requestEvidenceUpload,
  retryDocumentProcessing,
  triggerDocumentProcessing,
} from "../../api/endpoints";
import { IdentityDocumentStep } from "../../components/compliance/steps/IdentityDocumentStep";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { ComplianceStep, DocumentProcessingResult, Organization } from "../../types/api";

/**
 * API #110 (F1): the ID photos are stored (capture-first, step passed) and the
 * engine run failed for a technical reason. The only action re-runs the
 * engine over the SAME photos -- nothing is discarded, captured or uploaded
 * again -- and only while the server says `retry_available` for this reader.
 * A sponsor is refused once the person activated the account. Synthetic
 * results only; the endpoints are mocked (the route is checked over HTTP in
 * document-technical-retry-http.test.ts).
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../api/endpoints", () => ({
  fetchDocumentResult: jest.fn(),
  retryDocumentProcessing: jest.fn(),
  triggerDocumentProcessing: jest.fn(),
  requestEvidenceUpload: jest.fn(),
  completeEvidenceUpload: jest.fn(),
  attemptComplianceStep: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const mockedFetchDocumentResult = fetchDocumentResult as jest.Mock;
const mockedRetry = retryDocumentProcessing as jest.Mock;
const uploadAndCaptureCalls = () =>
  (triggerDocumentProcessing as jest.Mock).mock.calls.length +
  (requestEvidenceUpload as jest.Mock).mock.calls.length +
  (completeEvidenceUpload as jest.Mock).mock.calls.length;

const ORG = { id: "org-sintetica", name: "Organización sintética" } as Organization;
const STEP = {
  id: "doc-step", step_type: "identity_document", status: "passed", provider: "afilianet", score: 0.5, attempt_count: 1,
  completed_at: "2026-11-02T17:14:00Z", created_at: "2026-11-02T17:10:00Z", configured_provider: "afilianet",
  provider_actionable: true, provider_unavailable_reason: null,
} as ComplianceStep;

function docResult(overrides: Partial<DocumentProcessingResult> = {}): DocumentProcessingResult {
  return {
    id: "ocr-1", capture_accepted: true, retry_available: true, executions_used: 1, executions_max: 3, document_type: "mx_ine", status: "failed", verdict: null,
    confidence: null, extracted_fields: [], validation_checks: [], quality: null, confirmed_fields: null,
    confirmation_required: false, confirmation_status: "not_required", failure_reason: "engine_busy",
    processor_version: "sintetico-1", attempt_number: 1, started_at: null, completed_at: null, created_at: "2026-11-02T17:14:00Z",
    ...overrides,
  };
}

const RETRY_PENDING = docResult({ id: "ocr-2", status: "pending", failure_reason: null, retry_available: false, attempt_number: 2, executions_used: 2 });

let queryClient: QueryClient;

function orgValue(organization: Organization): OrganizationContextValue {
  return { status: "ready", organizations: [organization], activeOrganization: organization, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
}

async function renderStep({ assisted, organization = ORG }: { assisted?: string; organization?: Organization } = {}) {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(organization)}>
        <IdentityDocumentStep step={STEP} attempt={jest.fn()} isPending={false} />
      </OrganizationContext.Provider>
    </QueryClientProvider>
  );
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = await render(assisted ? <AssistedComplianceContext.Provider value={assisted}>{tree}</AssistedComplianceContext.Provider> : tree);
  });
  return view;
}

const BUTTON = "Volver a procesar las fotos";

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
});

describe("technical failure with the photos stored", () => {
  it.each(["engine_busy", "timeout", "ocr_unavailable", "unexpected_error"])("%s: keeps the photos and offers to process them again", async (reason) => {
    mockedFetchDocumentResult.mockResolvedValue(docResult({ failure_reason: reason }));
    const view = await renderStep();
    expect(await view.findByText(BUTTON)).toBeTruthy();
    expect(view.getByText(/Fue un problema técnico, no de las fotos. Se conservan/)).toBeTruthy();
    // From the server's counters, its automatic runs included.
    expect(view.getByText("Quedan 2 intentos.")).toBeTruthy();
    expect(view.queryByText("Tomar nuevas fotos")).toBeNull();
    expect(view.queryByText("Volver a tomar foto")).toBeNull();
  });

  it("retrying calls only the reprocess route, uploads nothing, and polls the new run on the same photos", async () => {
    let served: DocumentProcessingResult = docResult();
    mockedFetchDocumentResult.mockImplementation(async () => served);
    mockedRetry.mockImplementation(async () => {
      served = RETRY_PENDING;
      return RETRY_PENDING;
    });
    const view = await renderStep();
    await act(async () => {
      fireEvent.press(await view.findByText(BUTTON));
    });

    expect(mockedRetry).toHaveBeenCalledTimes(1);
    expect(mockedRetry).toHaveBeenCalledWith("doc-step");
    expect(uploadAndCaptureCalls()).toBe(0);
    expect((await view.findByTestId("document-retry-processing")).props.children).toBe(
      "Estamos procesando de nuevo las fotos guardadas. Puedes continuar y consultar el estado después.",
    );

    served = docResult({ id: "ocr-2", status: "completed", verdict: "pass", failure_reason: null, retry_available: false, attempt_number: 2, executions_used: 2 });
    await waitFor(() => expect(view.queryByTestId("document-retry-processing")).toBeNull(), { timeout: 6000 });
    expect(view.queryByText(BUTTON)).toBeNull();
    expect(uploadAndCaptureCalls()).toBe(0);
  }, 10000);

  it("a double tap sends a single retry", async () => {
    mockedFetchDocumentResult.mockResolvedValue(docResult());
    let resolveRetry!: (value: DocumentProcessingResult) => void;
    mockedRetry.mockImplementation(() => new Promise((resolve) => (resolveRetry = resolve)));
    const view = await renderStep();
    const button = await view.findByText(BUTTON);
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockedRetry).toHaveBeenCalledTimes(1);
    await act(async () => resolveRetry(RETRY_PENDING));
    expect(mockedRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["409 document_retry_not_available", new ApiError("conflict", "x", 409, undefined, { reason: "document_retry_not_available" }), "Este reintento ya no está disponible. Actualizamos el estado."],
    ["409 document_retry_limit_reached", new ApiError("conflict", "x", 409, undefined, { reason: "document_retry_limit_reached" }), "Ya no se pueden volver a procesar desde la app. Las fotos se conservan y el caso pasará a revisión de la organización."],
    ["503 document_engine_unavailable", new ApiError("server", "x", 503, undefined, { reason: "document_engine_unavailable" }), "La verificación de documentos no está disponible temporalmente. Inténtalo de nuevo en unos minutos."],
    ["503 kyc_unavailable", new ApiError("server", "x", 503, undefined, { reason: "kyc_unavailable" }), "Verificación de identidad no disponible en esta organización."],
    ["422 closed case", new ApiError("validation", "Esta verificación ya está cerrada.", 422), "Esta verificación ya está cerrada."],
  ])("%s: says so, reads the result again and never retries on its own", async (_label, error, message) => {
    mockedFetchDocumentResult.mockResolvedValue(docResult());
    mockedRetry.mockRejectedValue(error);
    const view = await renderStep();
    await view.findByText(BUTTON);
    const readsBefore = mockedFetchDocumentResult.mock.calls.length;
    await act(async () => {
      fireEvent.press(view.getByText(BUTTON));
    });
    expect(await view.findByText(message)).toBeTruthy();
    await waitFor(() => expect(mockedFetchDocumentResult.mock.calls.length).toBeGreaterThan(readsBefore));
    expect(mockedRetry).toHaveBeenCalledTimes(1);
    expect(uploadAndCaptureCalls()).toBe(0);
  });

  it("409 document_processing_in_progress: no error, reads the result again and shows the run already in flight", async () => {
    let served = docResult();
    mockedFetchDocumentResult.mockImplementation(async () => served);
    mockedRetry.mockImplementation(async () => {
      served = RETRY_PENDING;
      throw new ApiError("conflict", "x", 409, undefined, { reason: "document_processing_in_progress" });
    });
    const view = await renderStep();
    await act(async () => {
      fireEvent.press(await view.findByText(BUTTON));
    });
    expect((await view.findByTestId("document-retry-processing")).props.children).toMatch(/procesando de nuevo las fotos guardadas/);
    expect(view.queryByText(/Algo salió mal/)).toBeNull();
    expect(mockedRetry).toHaveBeenCalledTimes(1);
  });

  it("the server's automatic retry: keeps polling the new pending run, shows no button meanwhile and never calls retry", async () => {
    let served = docResult({ status: "processing", failure_reason: null, retry_available: false });
    mockedFetchDocumentResult.mockImplementation(async () => served);
    const view = await renderStep();
    expect((await view.findByTestId("document-retry-processing")).props.children).toBe("Fotos de identificación guardadas");

    // The engine failed and the server already queued the next run (higher attempt_number, same capture).
    served = docResult({ id: "ocr-2", status: "pending", failure_reason: null, retry_available: true, attempt_number: 2, executions_used: 2 });
    await waitFor(() => expect(view.getByTestId("document-retry-processing").props.children).toMatch(/procesando de nuevo/), { timeout: 6000 });
    expect(view.queryByText(BUTTON)).toBeNull();

    served = docResult({ id: "ocr-2", status: "completed", verdict: "pass", failure_reason: null, retry_available: false, attempt_number: 2, executions_used: 2 });
    await waitFor(() => expect(view.queryByTestId("document-retry-processing")).toBeNull(), { timeout: 6000 });
    expect(mockedRetry).not.toHaveBeenCalled();
    expect(uploadAndCaptureCalls()).toBe(0);
  }, 15000);
});

describe("no retry button", () => {
  it.each([
    ["retry_available false (cap reached or staff intervened)", docResult({ retry_available: false, executions_used: 3 })],
    ["retry_available absent (API before #110)", docResult({ retry_available: undefined })],
  ])("%s on a technical failure: photos kept, the organization reviews", async (_label, result) => {
    mockedFetchDocumentResult.mockResolvedValue(result);
    const view = await renderStep();
    expect((await view.findByTestId("document-retry-unavailable"))).toBeTruthy();
    expect(view.getByText("No pudimos procesar las fotos por un problema técnico. Se conservan y el caso pasará a revisión de la organización.")).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
    expect(view.queryByText(/rechaz/i)).toBeNull();
  });

  it.each(["poor_image_quality", "image_decode_failed", "evidence_unavailable"])("unusable photo (%s, retry_available false): not a technical failure, no button", async (reason) => {
    mockedFetchDocumentResult.mockResolvedValue(docResult({ failure_reason: reason, retry_available: false }));
    const view = await renderStep();
    expect(await view.findByText("Fotos de identificación guardadas")).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
  });

  it("KYC capture off: no button (the server would answer 503 kyc_unavailable)", async () => {
    mockedFetchDocumentResult.mockResolvedValue(docResult());
    const view = await renderStep({ organization: { ...ORG, identity_verification_available: false } as Organization });
    expect(await view.findByTestId("document-retry-unavailable")).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
  });
});

describe("sponsor in an assisted verification", () => {
  it("before the person activates the account (retry_available true for the sponsor): may retry, scoped to the enrollment", async () => {
    mockedFetchDocumentResult.mockResolvedValue(docResult());
    mockedRetry.mockResolvedValue(RETRY_PENDING);
    const view = await renderStep({ assisted: "enrollment-a" });
    await act(async () => {
      fireEvent.press(await view.findByText(BUTTON));
    });
    expect(mockedRetry).toHaveBeenCalledWith("doc-step", "enrollment-a");
  });

  it("after the activation the server sends retry_available false: no button", async () => {
    mockedFetchDocumentResult.mockResolvedValue(docResult({ retry_available: false }));
    const view = await renderStep({ assisted: "enrollment-a" });
    expect(await view.findByTestId("document-retry-unavailable")).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
  });

  it("a stale screen tapped after the activation: 409 assisted_access_claimed says only the person can, rereads and does not retry", async () => {
    let served = docResult();
    mockedFetchDocumentResult.mockImplementation(async () => served);
    mockedRetry.mockImplementation(async () => {
      served = docResult({ retry_available: false });
      throw new ApiError("conflict", "x", 409, undefined, { reason: "assisted_access_claimed" });
    });
    const view = await renderStep({ assisted: "enrollment-a" });
    await act(async () => {
      fireEvent.press(await view.findByText(BUTTON));
    });
    expect(await view.findByText("La persona ya activó su cuenta. Debe continuar la verificación desde su propia sesión.")).toBeTruthy();
    await waitFor(() => expect(view.queryByText(BUTTON)).toBeNull());
    expect(mockedRetry).toHaveBeenCalledTimes(1);
    expect(uploadAndCaptureCalls()).toBe(0);
  });
});
