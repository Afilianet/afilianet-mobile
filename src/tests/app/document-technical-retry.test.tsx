import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  completeEvidenceUpload,
  fetchComplianceSteps,
  fetchDocumentResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  requestEvidenceUpload,
  retryDocumentProcessing,
  triggerDocumentProcessing,
} from "../../api/endpoints";
import ComplianceScreen from "../../app/compliance";
import { IdentityDocumentStep } from "../../components/compliance/steps/IdentityDocumentStep";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { ComplianceStatus, ComplianceStep, DocumentProcessingResult, Organization } from "../../types/api";

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
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(),
  startCompliance: jest.fn(),
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

async function renderStep({
  assisted,
  organization = ORG,
  caseStatus = "in_progress",
  currentStep = "biometric_liveness",
}: { assisted?: string; organization?: Organization; caseStatus?: ComplianceStatus; currentStep?: string | null } = {}) {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(organization)}>
        <IdentityDocumentStep step={STEP} attempt={jest.fn()} isPending={false} caseStatus={caseStatus} currentStep={currentStep} />
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
const IN_PROGRESS_TEXT =
  "No pudimos leer los datos de tu credencial. Tus fotos quedaron guardadas; no necesitas tomarlas de nuevo. Puedes continuar con los pasos pendientes. La organización revisará tu credencial cuando completes tu verificación.";

/** Never a rejection, never a new capture, never «already sent to review» while steps are pending. */
function expectNoPromiseNorRejection(view: Awaited<ReturnType<typeof render>>) {
  expect(view.queryByText(/rechaz/i)).toBeNull();
  expect(view.queryByText(/vuelve a tomar|volver a tomar|tomar nuevas fotos/i)).toBeNull();
  expect(view.queryByText(/(en|pasó a|pasará a) revisión/i)).toBeNull();
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
});

describe("technical failure with the photos stored", () => {
  it.each(["engine_busy", "timeout", "ocr_unavailable", "unexpected_error", "processing_timeout"])("%s: keeps the photos and offers to process them again", async (reason) => {
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
    ["409 document_retry_limit_reached", new ApiError("conflict", "x", 409, undefined, { reason: "document_retry_limit_reached" }), IN_PROGRESS_TEXT],
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
    expect(view.getByText(IN_PROGRESS_TEXT)).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
    expectNoPromiseNorRejection(view);
  });

  it("a lost run failed by the API as processing_timeout, no executions left: photos kept, goes to review", async () => {
    mockedFetchDocumentResult.mockResolvedValue(docResult({ failure_reason: "processing_timeout", retry_available: false, executions_used: 3 }));
    const view = await renderStep();
    expect(await view.findByTestId("document-retry-unavailable")).toBeTruthy();
    expect(view.queryByText(BUTTON)).toBeNull();
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

describe("the 3 executions used up: what the person can do next depends on the case (API #112)", () => {
  const exhausted = () => docResult({ retry_available: false, executions_used: 3 });

  it("in_progress with a pending next step: photos kept, names that step, no review claim nor rejection", async () => {
    mockedFetchDocumentResult.mockResolvedValue(exhausted());
    const view = await renderStep({ caseStatus: "in_progress", currentStep: "biometric_liveness" });
    expect(await view.findByText(IN_PROGRESS_TEXT)).toBeTruthy();
    expect(view.getByTestId("document-retry-next-step").props.children).toBe("Siguiente paso: Prueba de vida.");
    expect(view.queryByText(BUTTON)).toBeNull();
    expectNoPromiseNorRejection(view);
  });

  it("in_progress with only the terms pending: names the terms step, still no review claim", async () => {
    mockedFetchDocumentResult.mockResolvedValue(exhausted());
    const view = await renderStep({ caseStatus: "in_progress", currentStep: "terms_acceptance" });
    expect(await view.findByText(IN_PROGRESS_TEXT)).toBeTruthy();
    expect(view.getByTestId("document-retry-next-step").props.children).toBe("Siguiente paso: Aceptación de términos.");
    expectNoPromiseNorRejection(view);
  });

  it("manual_review: the photos are kept and the organization will review the ID; no next step", async () => {
    mockedFetchDocumentResult.mockResolvedValue(exhausted());
    const view = await renderStep({ caseStatus: "manual_review", currentStep: null });
    expect(await view.findByText("Tus fotos quedaron guardadas. La organización revisará tu credencial.")).toBeTruthy();
    expect(view.queryByTestId("document-retry-next-step")).toBeNull();
    expect(view.queryByText(/rechaz/i)).toBeNull();
    expect(view.queryByText(/tomar nuevas fotos|volver a tomar/i)).toBeNull();
  });

  it("409 document_retry_limit_reached on an in_progress case: the same next-step guidance", async () => {
    // The screen still offered the retry; meanwhile the server's automatic runs used up the 3 executions.
    let served = docResult();
    mockedFetchDocumentResult.mockImplementation(async () => served);
    mockedRetry.mockImplementation(async () => {
      served = exhausted();
      throw new ApiError("conflict", "x", 409, undefined, { reason: "document_retry_limit_reached" });
    });
    const view = await renderStep({ caseStatus: "in_progress", currentStep: "face_match" });
    await act(async () => {
      fireEvent.press(await view.findByText(BUTTON));
    });
    expect(await view.findByText(IN_PROGRESS_TEXT)).toBeTruthy();
    await waitFor(() => expect(view.queryByText(BUTTON)).toBeNull());
    expect(view.getByTestId("document-retry-next-step").props.children).toBe("Siguiente paso: Coincidencia facial.");
    expect(mockedRetry).toHaveBeenCalledTimes(1);
    expectNoPromiseNorRejection(view);
  });

  it.each([
    ["in_progress", "No pudimos leer los datos de la credencial. Las fotos quedaron guardadas; no es necesario tomarlas de nuevo. Se puede continuar con los pasos pendientes. La organización revisará la credencial de la persona cuando se complete su verificación."],
    ["manual_review", "Las fotos de la persona quedaron guardadas. La organización revisará su credencial."],
  ] as const)("sponsor before the claim, %s: the same message about «la persona»", async (caseStatus, text) => {
    mockedFetchDocumentResult.mockResolvedValue(exhausted());
    const view = await renderStep({ assisted: "enrollment-a", caseStatus, currentStep: caseStatus === "in_progress" ? "biometric_liveness" : null });
    expect(await view.findByText(text)).toBeTruthy();
    expect(view.queryByText(/\btu\b|\btus\b/i)).toBeNull();
    expect(view.queryByText(/rechaz/i)).toBeNull();
  });

  it("through the verification screen: the case's status and current_step reach the document step", async () => {
    const terms = {
      ...STEP, id: "terms-step", step_type: "terms_acceptance", status: "pending", provider: null, score: null, attempt_count: 0,
      completed_at: null, configured_provider: null, terms_document: null,
    } as ComplianceStep;
    (fetchMyAffiliateProfile as jest.Mock).mockResolvedValue({ id: "aff-1", affiliate_code: "AFF1", status: "pending" });
    (fetchMyCompliance as jest.Mock).mockResolvedValue({
      id: "case-1", status: "in_progress", current_step: "terms_acceptance", risk_level: null, started_at: null, submitted_at: null,
      reviewed_at: null, approved_at: null, rejected_at: null, expires_at: null, rejection_reason: null, created_at: "2026-11-02T17:10:00Z",
      steps: [STEP, terms],
    });
    (fetchComplianceSteps as jest.Mock).mockResolvedValue([]);
    mockedFetchDocumentResult.mockResolvedValue(exhausted());
    const affiliateOrg = { ...ORG, my_role: "affiliate", my_membership_status: "active" } as Organization;
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue(affiliateOrg)}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });
    expect(await view.findByText(IN_PROGRESS_TEXT)).toBeTruthy();
    expect(view.getByTestId("document-retry-next-step").props.children).toBe("Siguiente paso: Aceptación de términos.");
    expectNoPromiseNorRejection(view);
  });
});
