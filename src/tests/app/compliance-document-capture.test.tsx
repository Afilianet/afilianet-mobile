import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ApiError } from "../../api/errors";
import {
  attemptComplianceStep,
  completeEvidenceUpload,
  fetchComplianceSteps,
  fetchDocumentResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  requestEvidenceUpload,
  startCompliance,
  triggerDocumentProcessing,
} from "../../api/endpoints";
import { analytics } from "../../services/analytics";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type {
  AffiliateProfile,
  ComplianceCase,
  ComplianceStep,
  DocumentProcessingResult,
  Evidence,
  EvidenceUploadAuthorization,
  Organization,
} from "../../types/api";
import ComplianceScreen from "../../app/compliance";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(),
  attemptComplianceStep: jest.fn(),
  requestEvidenceUpload: jest.fn(),
  completeEvidenceUpload: jest.fn(),
  triggerDocumentProcessing: jest.fn(),
  fetchDocumentResult: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockRequestCameraPermission = jest.fn();
const mockLaunchCamera = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermission(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  CameraType: { back: "back", front: "front" },
}));

const mockFileUpload = jest.fn();
const mockFileDelete = jest.fn();
// The REAL, current on-disk byte count `new File(uri).size` reports --
// deliberately independent of whatever a test's mocked expo-image-picker
// `asset.fileSize` says (see "declares the real final file size..." below).
let mockFileSize = 500_000;
jest.mock("expo-file-system", () => ({
  // A plain class, not a jest.fn() -- jest.resetAllMocks() (used in
  // beforeEach below, since a queued-but-unconsumed mockResolvedValueOnce
  // must never leak into the next test) would otherwise wipe a
  // jest.fn().mockImplementation() set once here at module-mock time and
  // never re-established per test, silently breaking every test after it.
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return mockFileSize;
    }
    upload(...args: unknown[]) {
      return mockFileUpload(...args);
    }
    delete(...args: unknown[]) {
      return mockFileDelete(...args);
    }
  },
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock("expo-image", () => {
  const { Image: RNImage } = jest.requireActual("react-native");
  return { Image: RNImage };
});

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;
const mockedRequestEvidenceUpload = requestEvidenceUpload as jest.Mock;
const mockedCompleteEvidenceUpload = completeEvidenceUpload as jest.Mock;
const mockedTriggerDocumentProcessing = triggerDocumentProcessing as jest.Mock;
const mockedFetchDocumentResult = fetchDocumentResult as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

const ORG_A: Organization = {
  id: "org-a",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "affiliate",
  my_membership_status: "active",
};
const ORG_B: Organization = { ...ORG_A, id: "org-b", name: "Beta Org" };

function orgValue(overrides: Partial<OrganizationContextValue> = {}): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG_A],
    activeOrganization: ORG_A,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

const AFFILIATE: AffiliateProfile = {
  id: "aff-1",
  affiliate_code: "AFF100",
  status: "pending",
  joined_at: "2026-01-01T00:00:00Z",
  activated_at: null,
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
};

function complianceCase(overrides: Partial<ComplianceCase> = {}): ComplianceCase {
  return {
    id: "case-1",
    status: "in_progress",
    current_step: "identity_document",
    risk_level: null,
    started_at: "2026-01-01T00:00:00Z",
    submitted_at: null,
    reviewed_at: null,
    approved_at: null,
    rejected_at: null,
    expires_at: null,
    rejection_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function step(overrides: Partial<ComplianceStep> = {}): ComplianceStep {
  return {
    id: "step-1",
    step_type: "identity_document",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    // Phase 9C.2a defaults: this org is actionable-Afilianet, matching
    // every existing test's assumption that the real capture flow renders
    // by default -- tests that need a different provider-visibility
    // scenario override these explicitly.
    configured_provider: "afilianet",
    provider_actionable: true,
    provider_unavailable_reason: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-1",
    type: "id_document_front",
    status: "uploaded",
    provider: null,
    mime_type: "image/jpeg",
    size: 12345,
    captured_at: "2026-01-01T00:00:00Z",
    retention_until: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function uploadAuthorization(overrides: Partial<Evidence> = {}): EvidenceUploadAuthorization {
  return {
    evidence: evidence({ status: "pending_upload", ...overrides }),
    upload: {
      url: "http://127.0.0.1:8000/api/v1/_internal/evidence-local-uploads/local/abc123",
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      expires_at: "2026-01-01T00:05:00Z",
    },
  };
}

function documentResult(overrides: Partial<DocumentProcessingResult> = {}): DocumentProcessingResult {
  return {
    id: "result-1",
    document_type: "mx_ine",
    status: "pending",
    verdict: null,
    confidence: null,
    extracted_fields: [],
    confirmed_fields: null,
    confirmation_required: false,
    confirmation_status: "not_required",
    failure_reason: null,
    processor_version: "afilianet-document-engine-1",
    attempt_number: 1,
    started_at: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

let queryClient: QueryClient;

async function renderCompliance(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <ComplianceScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) -- a mockResolvedValueOnce queued but
  // never consumed by one test (e.g. a "retake" that returns to guidance
  // without relaunching the camera) must never leak into the next test's
  // mock call queue.
  jest.resetAllMocks();
  mockFileSize = 500_000;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedStartCompliance.mockResolvedValue(complianceCase());
  mockedAttemptComplianceStep.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue([step()]);
  mockedFetchDocumentResult.mockRejectedValue(NOT_FOUND);
  mockedRequestEvidenceUpload.mockResolvedValue(uploadAuthorization());
  mockFileUpload.mockResolvedValue({ status: 200, headers: {}, body: "" });
  mockedCompleteEvidenceUpload.mockResolvedValue(evidence());
  mockedTriggerDocumentProcessing.mockResolvedValue(documentResult({ status: "pending" }));
});

afterEach(() => {
  queryClient.clear();
});

// Phase 9F.2: every document-type selection now lands on the one-time
// geolocation consent screen before the evidence checklist -- "Continuar sin
// ubicación" is the neutral default for tests that aren't specifically
// exercising the geolocation feature itself (see
// compliance-document-geolocation.test.tsx for those).
async function dismissGeolocationConsent(findByText: (text: RegExp | string) => Promise<unknown>) {
  fireEvent.press((await findByText("Continuar sin ubicación")) as never);
}

async function chooseIne(getByText: (text: string) => unknown, findByText: (text: RegExp | string) => Promise<unknown>) {
  fireEvent.press((await findByText("INE mexicana")) as never);
  await dismissGeolocationConsent(findByText);
  await findByText("Frente");
}

describe("Document capture: document type selection", () => {
  it("offers only mx_ine and passport, with their real requirements", async () => {
    const { findByText } = await renderCompliance();
    expect(await findByText("¿Qué documento vas a proporcionar?")).toBeTruthy();
    expect(await findByText("INE mexicana")).toBeTruthy();
    expect(await findByText("Pasaporte")).toBeTruthy();
    expect(await findByText("Requiere: Frente + Reverso")).toBeTruthy();
    expect(await findByText("Requiere: Página de identidad")).toBeTruthy();
  });

  it("shows a front/back checklist for mx_ine", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    expect(await findByText("Frente")).toBeTruthy();
    expect(await findByText("Reverso")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });

  it("shows a single identity-page checklist for passport", async () => {
    const { getByText, findByText } = await renderCompliance();
    fireEvent.press(await findByText("Pasaporte"));
    await dismissGeolocationConsent(findByText);
    expect(await findByText("Página de identidad")).toBeTruthy();
    expect(getByText("Enviar para verificación")).toBeTruthy();
  });
});

describe("Document capture: camera permission and capture", () => {
  it("shows a permission-denied state and lets the user open settings", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "denied" });
    const settingsSpy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined as never);

    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Frente"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Se necesita acceso a la cámara")).toBeTruthy();
    fireEvent.press(getByText("Abrir configuración"));
    expect(settingsSpy).toHaveBeenCalledTimes(1);
    settingsSpy.mockRestore();
  });

  it("shows an unavailable state when the camera itself fails to launch", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockRejectedValue(new Error("no camera hardware"));

    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Frente"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Cámara no disponible")).toBeTruthy();
  });

  it("returns to guidance without an error when the user cancels the native camera", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });

    const { getByText, findByText, queryByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Frente"));
    fireEvent.press(await findByText("Abrir cámara"));

    await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalledTimes(1));
    expect(queryByText(/no se pudo capturar|error/i)).toBeNull();
    expect(await findByText("Abrir cámara")).toBeTruthy();
  });

  it("previews a captured photo and supports retake before uploading", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/front-1.jpg", width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
    });

    const { getByText, findByText, queryByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Frente"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Volver a tomar")).toBeTruthy();
    expect(await findByText("Usar esta foto")).toBeTruthy();
    expect(mockedRequestEvidenceUpload).not.toHaveBeenCalled();

    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/front-2.jpg", width: 1200, height: 800, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Volver a tomar"));
    expect(await findByText("Abrir cámara")).toBeTruthy();
    expect(queryByText("Usar esta foto")).toBeNull();
  });
});

describe("Document capture: upload flow (Phase 9B real endpoints)", () => {
  async function captureAndUse(getByText: (text: string) => unknown, findByText: (text: RegExp | string) => Promise<unknown>) {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/front.jpg", width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Frente") as never);
    fireEvent.press((await findByText("Abrir cámara")) as never);
    fireEvent.press((await findByText("Usar esta foto")) as never);
  }

  it("requests upload authorization, PUTs the binary, and completes it -- exactly the real Phase 9B contract", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText);

    await waitFor(() =>
      expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith(
        "step-1",
        expect.objectContaining({ evidence_type: "id_document_front", mime_type: "image/jpeg", size: 500_000 }),
      ),
    );
    await waitFor(() =>
      expect(mockFileUpload).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/_internal/evidence-local-uploads/local/abc123",
        expect.objectContaining({ httpMethod: "PUT", headers: { "Content-Type": "image/jpeg" } }),
      ),
    );
    await waitFor(() => expect(mockedCompleteEvidenceUpload).toHaveBeenCalledWith("ev-1"));
    await waitFor(() => expect(mockFileDelete).toHaveBeenCalledTimes(1));
    expect(await findByText("Capturado")).toBeTruthy();
  });

  it("does not enable Submit until every required side is uploaded", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText); // front only -- back still missing
    await findByText("Capturado");

    fireEvent.press(getByText("Enviar para verificación"));
    // A disabled Button's Pressable never fires onPress -- triggering stays
    // uncalled until the still-missing "Reverso" side is captured too.
    expect(mockedTriggerDocumentProcessing).not.toHaveBeenCalled();
  });

  it("surfaces a clean error and keeps the local photo when the direct PUT fails", async () => {
    mockFileUpload.mockResolvedValue({ status: 500, headers: {}, body: "" });
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText);

    expect(await findByText(/la carga no se completó/i)).toBeTruthy();
    expect(mockedCompleteEvidenceUpload).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it("declares the real final on-disk file size to the backend, never expo-image-picker's own estimate", async () => {
    // A real physical-device bug: expo-image-picker's reported asset.fileSize
    // can diverge from the file actually written to disk at asset.uri. Set
    // to a DIFFERENT value than the mocked camera's fileSize (500_000) here
    // specifically to prove the declared size always comes from the real
    // file, never the camera's own estimate.
    mockFileSize = 612_000;
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText);

    await waitFor(() =>
      expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith("step-1", expect.objectContaining({ size: 612_000 })),
    );
  });

  it("clears the stuck loading state and re-enables Retake when the backend rejects at completion (e.g. a size mismatch)", async () => {
    // Mirrors the real EvidenceUploadService::complete() rejection ("the
    // uploaded object size does not match what was declared"): the PUT
    // succeeds, but complete() throws. A prior version of
    // useEvidenceUploadFlow only reset `stage` back to "idle" on the
    // explicit PUT-failure branch, leaving this exact rejection stuck at
    // "completing" forever and permanently disabling Retake/Retry.
    mockedCompleteEvidenceUpload.mockRejectedValue(
      new ApiError("validation", "Evidence verification failed: the uploaded object size does not match what was declared."),
    );
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText);

    expect(await findByText(/does not match what was declared/i)).toBeTruthy();

    // A disabled Button's Pressable never fires onPress -- reaching "Open
    // camera" again is only possible if Retake was actually enabled.
    fireEvent.press(getByText("Volver a tomar"));
    expect(await findByText("Abrir cámara")).toBeTruthy();
  });
});

describe("Document capture: processing and polling", () => {
  it("shows Waiting/Processing states and stops polling once completed", async () => {
    jest.useFakeTimers();
    try {
      mockedFetchDocumentResult
        .mockResolvedValueOnce(documentResult({ status: "pending" }))
        .mockResolvedValueOnce(documentResult({ status: "processing" }))
        .mockResolvedValue(documentResult({ status: "completed", verdict: "pass", extracted_fields: [] }));

      const { findByText } = await renderCompliance();

      // An in-flight attempt already exists for this step from mount --
      // IdentityDocumentStep always polls the result regardless of the
      // capture checklist's own local state.
      expect(await findByText("Esperando el documento")).toBeTruthy();
      const firstCallCount = mockedFetchDocumentResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(await findByText("Procesando tu documento")).toBeTruthy();
      expect(mockedFetchDocumentResult.mock.calls.length).toBeGreaterThan(firstCallCount);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await findByText("Confirmado desde el documento");
      const callsAfterCompleted = mockedFetchDocumentResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(9000);
      });
      expect(mockedFetchDocumentResult.mock.calls.length).toBe(callsAfterCompleted);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Document capture: operational unavailability (Phase 9C.2a, 503 on trigger)", () => {
  it("shows a distinct temporarily-unavailable message on a 503, never a document-rejection message, and never auto-retries", async () => {
    mockedTriggerDocumentProcessing.mockRejectedValue(
      new ApiError("server", "Document processing is temporarily unavailable - please try again later.", 503),
    );

    const { getByText, findByText, findAllByText, queryByText } = await renderCompliance();
    await chooseIne(getByText, findByText);

    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    const sides: [string, string][] = [
      ["Frente", "file:///tmp/front.jpg"],
      ["Reverso", "file:///tmp/back.jpg"],
    ];
    for (let i = 0; i < sides.length; i++) {
      const [label, uri] = sides[i];
      mockLaunchCamera.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri, width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
      });
      fireEvent.press(getByText(label) as never);
      fireEvent.press((await findByText("Abrir cámara")) as never);
      fireEvent.press((await findByText("Usar esta foto")) as never);
      // "Capturado" alone is ambiguous once both sides are done -- wait for
      // the expected COUNT of captured rows instead.
      await waitFor(async () => expect((await findAllByText("Capturado")).length).toBe(i + 1));
    }

    fireEvent.press(getByText("Enviar para verificación"));

    // The Badge's own title text ("Temporarily unavailable") also matches
    // this regex -- assert on the fuller description sentence specifically,
    // not just any node containing "temporarily unavailable".
    expect(await findByText(/la verificación de documentos no está disponible temporalmente/i)).toBeTruthy();
    // Never framed as a document rejection/invalid-document/identity result.
    expect(queryByText(/rechazado|documento inválido|no pudo ser verificado/i)).toBeNull();

    // A manual retry (pressing Submit again) is always available -- this is
    // never an automatic loop; the mutation only ever fires once per press.
    expect(mockedTriggerDocumentProcessing).toHaveBeenCalledTimes(1);
  });
});

describe("Document capture: result review (read-only, no fake confirmation)", () => {
  it("renders only normalized fields, with friendly labels, never raw check names or object keys", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({
        status: "completed",
        verdict: "pass",
        extracted_fields: [
          { name: "first_name", value: "JUAN CARLOS", confidence: 0.97, confirmation_required: true },
          { name: "curp", value: "PEGJ900515HDFRZN08", confidence: 0.79, confirmation_required: true },
          { name: "date_of_birth", value: "1990-05-15", confidence: 0.97, confirmation_required: true },
        ],
      }),
    );

    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Nombre(s)")).toBeTruthy();
    expect(await findByText("JUAN CARLOS")).toBeTruthy();
    expect(await findByText("CURP")).toBeTruthy();
    expect(await findByText("PEGJ900515HDFRZN08")).toBeTruthy();
    expect(await findByText("Fecha de nacimiento")).toBeTruthy();
    expect(await findByText("15 de mayo de 1990")).toBeTruthy();

    // Never a raw backend check/field name or processor internal.
    expect(queryByText(/curp_format|front_present|required_fields_present/i)).toBeNull();
    expect(queryByText(/0\.97|0\.79/)).toBeNull();
  });

  it("never offers a confirm action when this result doesn't require confirmation", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({
        status: "completed",
        verdict: "review",
        extracted_fields: [{ name: "curp", value: "PEGJ900515HDFRZNO8", confidence: 0.79, confirmation_required: true }],
        // confirmation_status left at the builder's default ("not_required") --
        // see the "Document confirmation" describe block below for the real
        // confirmation-required/editable-form coverage (Phase 9C.2a).
      }),
    );

    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Por favor revisa")).toBeTruthy();
    expect(queryByText(/^Guardar$/i)).toBeNull();
    expect(queryByText(/^Confirmar$/i)).toBeNull();
    expect(queryByText(/guardar cambios/i)).toBeNull();
  });

  it("verdict: fail offers Try again, which returns to the capture checklist for the same document type", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "fail", document_type: "mx_ine" }));

    const { findByText, findAllByText } = await renderCompliance();

    expect(await findByText("Necesita corrección")).toBeTruthy();
    fireEvent.press(await findByText("Intenta de nuevo"));
    // document_type was recovered from the existing result -- no need to
    // re-choose it, but a retry is a new attempt, so the one-time
    // geolocation consent screen shows again before the checklist.
    await dismissGeolocationConsent(findByText);
    expect(await findByText("Frente")).toBeTruthy();
    expect(await findByText("Reverso")).toBeTruthy();
    expect((await findAllByText("Aún no capturado")).length).toBe(2);
  });
});

describe("Document capture: technical failure and manual review", () => {
  it("maps poor_image_quality to a retake-oriented message", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "poor_image_quality" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/vuelve a tomarla con mejor iluminación/i)).toBeTruthy();
  });

  it("maps an unavailable OCR engine to a distinct, non-blaming message", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "ocr_unavailable" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/no está disponible temporalmente/i)).toBeTruthy();
  });

  it("maps an unrecognized technical failure_reason (e.g. unexpected_error) to a generic, still-retryable message", async () => {
    // DocumentProcessingService::run()'s generic Throwable catch persists
    // this exact reason for anything not already caught by
    // DocumentQualityException/OcrEngineUnavailableException/
    // DocumentEvidenceUnavailableException -- confirmed by reading that
    // service directly. Never a fatal dead end: still offers Retake photo,
    // same as every other technical failure.
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "unexpected_error" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/algo salió mal al procesar tu documento/i)).toBeTruthy();
    expect(await findByText("Volver a tomar foto")).toBeTruthy();
  });

  it("Retake photo after a technical failure clears evidence/error state and returns to the capture checklist", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "poor_image_quality", document_type: "mx_ine" }));
    const { findByText, findAllByText } = await renderCompliance();

    expect(await findByText(/vuelve a tomarla con mejor iluminación/i)).toBeTruthy();
    fireEvent.press(await findByText("Volver a tomar foto"));

    // document_type was recovered from the existing result -- no need to
    // re-choose it, but a retry is a new attempt, so the one-time
    // geolocation consent screen shows again before the checklist (both
    // sides reset -- no stale "Capturado" from whatever was uploaded before
    // this failure).
    await dismissGeolocationConsent(findByText);
    expect(await findByText("Frente")).toBeTruthy();
    expect(await findByText("Reverso")).toBeTruthy();
    expect((await findAllByText("Aún no capturado")).length).toBe(2);
  });

  it("shows a manual-review waiting state, with no retry button, when verdict is review", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "review" }));
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Por favor revisa")).toBeTruthy();
    expect(await findByText(/revisión manual/i)).toBeTruthy();
    expect(queryByText("Intenta de nuevo")).toBeNull();
  });
});

describe("Document capture: provider awareness (Phase 9C.2a authoritative gate)", () => {
  it("never shows the Afilianet capture flow when configured_provider is incode", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ configured_provider: "incode", provider_actionable: false, provider_unavailable_reason: null }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    // The Badge title itself is also "Different flow" -- assert on the
    // fuller description sentence specifically, not just any matching node.
    expect(await findByText(/usa un flujo diferente/i)).toBeTruthy();
    expect(queryByText("¿Qué documento vas a proporcionar?")).toBeNull();
    expect(mockedFetchDocumentResult).not.toHaveBeenCalled();
  });

  it("shows the real capture flow when configured_provider is afilianet and actionable, ignoring step.provider's attempt-history label", async () => {
    // `provider` (attempt history) intentionally set to a stale/irrelevant
    // value here -- the gate must use configured_provider/provider_actionable
    // only, never `provider`.
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ provider: "fake-identity", configured_provider: "afilianet", provider_actionable: true }),
    ]);
    const { findByText } = await renderCompliance();
    expect(await findByText("¿Qué documento vas a proporcionar?")).toBeTruthy();
  });

  it("shows a safe unavailable state, never the capture flow, when afilianet is configured but not actionable", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ configured_provider: "afilianet", provider_actionable: false, provider_unavailable_reason: "engine_unavailable" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    // The Badge title itself is also "Temporarily unavailable" -- assert on
    // the fuller description sentence specifically.
    expect(await findByText(/verificación de documentos no está disponible temporalmente/i)).toBeTruthy();
    expect(queryByText("¿Qué documento vas a proporcionar?")).toBeNull();
    expect(mockedFetchDocumentResult).not.toHaveBeenCalled();
  });

  it("never assumes Afilianet or Fake for an unconfigured/null provider", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ configured_provider: null, provider_actionable: false, provider_unavailable_reason: "not_configured" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/aún no está configurado para esta organización/i)).toBeTruthy();
    expect(queryByText("¿Qué documento vas a proporcionar?")).toBeNull();
    expect(mockedFetchDocumentResult).not.toHaveBeenCalled();
  });
});

describe("Document capture: tenant isolation", () => {
  it("resets all local capture state and stops polling when the organization changes", async () => {
    mockedFetchDocumentResult.mockRejectedValue(NOT_FOUND);
    const { getByText, findByText, rerender } = await renderCompliance();
    await chooseIne(getByText, findByText);
    expect(await findByText("Frente")).toBeTruthy();

    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "step-org-b" })]);
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    // Back to the type selector for the new organization -- no stale "Frente"
    // checklist or captured-evidence state survives the switch.
    expect(await findByText("¿Qué documento vas a proporcionar?")).toBeTruthy();
    expect(mockedFetchDocumentResult).toHaveBeenCalledWith("step-org-b");
  });
});

describe("Document capture: privacy", () => {
  it("never sends document/evidence details to analytics", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/front.jpg", width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Frente"));
    fireEvent.press(await findByText("Abrir cámara"));
    fireEvent.press(await findByText("Usar esta foto"));
    await findByText("Capturado");

    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1); // event name only, no properties object
      expect(JSON.stringify(call)).not.toMatch(/step-1|ev-1|id_document_front|file:\/\/\/tmp/i);
    }
  });
});
