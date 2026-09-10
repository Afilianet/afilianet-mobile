import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { act, configure, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  attemptComplianceStep,
  completeEvidenceUpload,
  fetchComplianceSteps,
  fetchFaceMatchResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  requestEvidenceUpload,
  startCompliance,
  triggerFaceMatchProcessing,
} from "../../api/endpoints";
import { analytics } from "../../services/analytics";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type {
  AffiliateProfile,
  ComplianceCase,
  ComplianceStep,
  Evidence,
  EvidenceUploadAuthorization,
  FaceMatchProcessingResult,
  Organization,
} from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * Phase 9D.3(.1): the real self-service face-match flow (Compliance
 * face_match step -> provider gate -> selfie capture -> Evidence upload
 * against face_match's own step -> face-match-processing -> poll ->
 * result). Mirrors compliance-document-capture.test.tsx's exact
 * mocking/rendering setup.
 */
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
  triggerFaceMatchProcessing: jest.fn(),
  fetchFaceMatchResult: jest.fn(),
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
// deliberately a SEPARATE value from whatever a test's mocked
// expo-image-picker `asset.fileSize` says, since that's exactly the real
// physical-device bug this file's "declares the real final file size"
// test below covers: the two can legitimately differ, and only this one
// (what the hook now measures right before upload) may ever reach the
// backend as the declared size.
let mockFileSize = 400_000;
jest.mock("expo-file-system", () => ({
  // A plain class, not a jest.fn() -- jest.resetAllMocks() (used in
  // beforeEach below) would otherwise wipe a jest.fn().mockImplementation()
  // set once here at module-mock time and never re-established per test.
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
const mockedTriggerFaceMatchProcessing = triggerFaceMatchProcessing as jest.Mock;
const mockedFetchFaceMatchResult = fetchFaceMatchResult as jest.Mock;
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
    current_step: "face_match",
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

function faceMatchStep(overrides: Partial<ComplianceStep> = {}): ComplianceStep {
  return {
    id: "face-match-step-1",
    step_type: "face_match",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    configured_provider: "afilianet",
    provider_actionable: true,
    provider_unavailable_reason: null,
    ...overrides,
  };
}

function biometricStep(overrides: Partial<ComplianceStep> = {}): ComplianceStep {
  return {
    id: "biometric-step-1",
    step_type: "biometric_liveness",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    configured_provider: null,
    provider_actionable: false,
    provider_unavailable_reason: "provider_not_implemented",
    ...overrides,
  };
}

const DEFAULT_STEPS = [faceMatchStep(), biometricStep()];

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-1",
    type: "selfie",
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

function faceMatchResult(overrides: Partial<FaceMatchProcessingResult> = {}): FaceMatchProcessingResult {
  return {
    id: "fm-result-1",
    status: "pending",
    verdict: null,
    failure_reason: null,
    attempt_number: 1,
    started_at: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

// This flow has one more async layer than document-capture's (FaceMatchStep's
// own useComplianceSteps call, on top of the compliance screen's existing
// fetches) -- bump RTL's default findBy*/waitFor timeout (1000ms) to give
// the documented Windows resource-contention flakiness (see
// compliance-document-capture.test.tsx's own history) more room, without
// weakening what any assertion actually checks.
configure({ asyncUtilTimeout: 15000 });
// The per-TEST default (package.json's jest.testTimeout: 10000) is shorter
// than asyncUtilTimeout above -- under Windows resource contention a slow
// findBy* could hit Jest's own overall test timeout before RTL's own
// timeout even has a chance to apply, killing the test outright regardless
// of --testTimeout on the CLI. Raised here, scoped to this file only.
jest.setTimeout(30000);

// TanStack Query's notifyManager always schedules subscriber
// notifications via a real setTimeout(0), never a microtask (see
// notifyManager.ts's systemSetTimeoutZero default) -- under `act()`,
// which only awaits microtasks, a query/mutation update can still be
// un-flushed by the time a test function returns. A real timer left
// pending past a test's end can then fire against an already-unmounted
// tree later and corrupt react-test-renderer's shared act() scope for
// the rest of the file (every subsequent findBy* then hangs to its own
// timeout) -- this is exactly what TanStack Query's own testing docs
// call out `notifyManager.setScheduler` for: making every notification
// synchronous removes the real-timer window entirely.
notifyManager.setScheduler((callback) => callback());

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
  jest.resetAllMocks();
  mockFileSize = 400_000;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedStartCompliance.mockResolvedValue(complianceCase());
  mockedAttemptComplianceStep.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue(DEFAULT_STEPS);
  mockedFetchFaceMatchResult.mockRejectedValue(NOT_FOUND);
  mockedRequestEvidenceUpload.mockResolvedValue(uploadAuthorization());
  mockFileUpload.mockResolvedValue({ status: 200, headers: {}, body: "" });
  mockedCompleteEvidenceUpload.mockResolvedValue(evidence());
  mockedTriggerFaceMatchProcessing.mockResolvedValue(faceMatchResult({ status: "pending" }));
});

afterEach(() => {
  queryClient.clear();
});

async function captureAndUseSelfie(getByText: (text: string) => unknown, findByText: (text: RegExp | string) => Promise<unknown>) {
  mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
  });
  fireEvent.press((await findByText("Selfie")) as never);
  fireEvent.press((await findByText("Abrir cámara")) as never);
  fireEvent.press((await findByText("Usar esta foto")) as never);
  await findByText("Capturado");
}

// --- Provider awareness -------------------------------------------------------

describe("Face match: provider awareness", () => {
  it("shows the real selfie-capture flow when configured_provider is afilianet and actionable", async () => {
    const { findByText } = await renderCompliance();
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });

  it("never shows the Afilianet selfie flow when configured_provider is incode", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: "incode", provider_actionable: false, provider_unavailable_reason: null }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/usa un flujo diferente/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(mockedFetchFaceMatchResult).not.toHaveBeenCalled();
  });

  it("shows a safe unavailable state, never the capture flow, when afilianet is configured but not actionable", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: "afilianet", provider_actionable: false, provider_unavailable_reason: "engine_unavailable" }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/no está disponible temporalmente/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(mockedFetchFaceMatchResult).not.toHaveBeenCalled();
  });

  it("never assumes Afilianet or Fake for an unconfigured/null provider", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: null, provider_actionable: false, provider_unavailable_reason: "not_configured" }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/aún no está configurado para esta organización/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
  });

  it("never lets the client select a provider -- trigger sends no provider field", async () => {
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);
    fireEvent.press(getByText("Enviar para verificación"));

    await waitFor(() => expect(mockedTriggerFaceMatchProcessing).toHaveBeenCalledWith("face-match-step-1"));
  });
});

describe("Face match: failed-step retry gating (real physical-device case 72 regression)", () => {
  it("a failed, current, provider-actionable face_match step is fully retryable, not a dead end", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "failed", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "no_match" }));
    const { getByText, findByText } = await renderCompliance();

    expect(await findByText("Volver a tomar selfie")).toBeTruthy();
    fireEvent.press(getByText("Volver a tomar selfie"));
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });

  it("a pending, current face_match step is actionable too -- not only after a prior failure", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "pending", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });

  it("a passed face_match step is never editable, regardless of the underlying processing result", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "passed", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "match" }));
    const { queryByText, findByText } = await renderCompliance();

    expect(await findByText("Tu rostro coincidió con tu documento de identidad.")).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(queryByText("Enviar para verificación")).toBeNull();
    expect(queryByText("Volver a tomar selfie")).toBeNull();
  });

  it("current_step never gates this step's own actionability -- a failed, actionable face_match step is retryable even when current_step points elsewhere", async () => {
    // The mobile app never reads ComplianceCase.current_step to decide
    // whether a step's own card is interactive -- ordering is entirely
    // backend-enforced (provider_actionable/step-specific gates). This
    // guards against a future regression adding such a client-side gate,
    // which would reintroduce exactly the "cannot be clicked" bug this
    // phase fixed.
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ current_step: "verbal_consent" }));
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "failed", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    mockedFetchFaceMatchResult.mockRejectedValue(NOT_FOUND);
    const { findByText } = await renderCompliance();

    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });

  it("an unavailable provider blocks the flow even when the step itself is already failed", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "failed", configured_provider: "afilianet", provider_actionable: false, provider_unavailable_reason: "engine_unavailable" }),
      biometricStep({ status: "passed" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();

    expect(await findByText(/no está disponible temporalmente/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(queryByText("Enviar para verificación")).toBeNull();
  });
});

describe("Face match: no biometric_liveness sibling step required", () => {
  it("still shows the real selfie-capture flow when the org has no biometric_liveness step at all", async () => {
    // Phase 9D.3.1: face_match's selfie evidence uploads directly against
    // its own step now (see StepEvidenceCompatibility in afilianet-api), so
    // it no longer needs to resolve a biometric_liveness sibling step to
    // upload against -- an org that enables face_match without also
    // requiring biometric_liveness is a real, valid configuration now, not
    // an unavailable-state dead end.
    mockedFetchComplianceSteps.mockResolvedValue([faceMatchStep()]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Enviar para verificación")).toBeTruthy();
  });
});

// --- Capture -------------------------------------------------------------------

describe("Face match: selfie capture", () => {
  it("shows guidance then requests camera permission and captures a selfie", async () => {
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });

    fireEvent.press(await findByText("Selfie"));
    expect(await findByText("Toma una selfie")).toBeTruthy();
    expect(await findByText(/mira directamente a la cámara/i)).toBeTruthy();

    fireEvent.press(await findByText("Abrir cámara"));
    expect(mockRequestCameraPermission).toHaveBeenCalled();
    expect(await findByText("Usar esta foto")).toBeTruthy();
  });

  it("launches the camera at quality: 1 -- never the document flow's recompressing quality, to preserve EXIF orientation for the identity engine's face detector", async () => {
    // Real physical-device finding (Face Match attempts 3/4,
    // failure_reason: no_face_probe): the identity engine's face detector
    // zero-detects a rotated image with no EXIF orientation tag, and
    // expo-image-picker's Android quality<1 path re-exports/recompresses
    // the captured JPEG -- the most likely place that tag gets dropped.
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Abrir cámara"));
    await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalledTimes(1));

    expect(mockLaunchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 1, cameraType: "front", exif: false, base64: false, allowsEditing: false }),
    );
  });

  it("shows a permission-denied state and lets the user open settings", async () => {
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Se necesita acceso a la cámara")).toBeTruthy();
    expect(await findByText("Abrir configuración")).toBeTruthy();
  });

  it("shows an unavailable state when the camera itself fails to launch", async () => {
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockRejectedValue(new Error("no camera"));

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Cámara no disponible")).toBeTruthy();
  });

  it("returns to guidance without an error when the user cancels the native camera", async () => {
    const { findByText, queryByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Abrir cámara"));

    expect(await findByText("Abrir cámara")).toBeTruthy();
    expect(queryByText(/dañada|no se pudo leer/i)).toBeNull();
  });

  it("supports retake before uploading", async () => {
    const { getByText, findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie-1.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Abrir cámara"));
    expect(await findByText("Usar esta foto")).toBeTruthy();
    expect(mockedRequestEvidenceUpload).not.toHaveBeenCalled();

    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie-2.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Volver a tomar"));
    expect(await findByText("Abrir cámara")).toBeTruthy();
  });

  it("cancels out of the capture screen back to the checklist", async () => {
    const { getByText, findByText, queryByText } = await renderCompliance();
    fireEvent.press(await findByText("Selfie"));
    expect(await findByText("Toma una selfie")).toBeTruthy();

    fireEvent.press(getByText("Cancelar"));
    expect(await findByText("Selfie")).toBeTruthy();
    expect(queryByText("Toma una selfie")).toBeNull();
  });
});

// --- Evidence upload -------------------------------------------------------------

describe("Face match: selfie evidence upload", () => {
  it("uploads directly against face_match's own step id", async () => {
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    await waitFor(() =>
      expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith(
        "face-match-step-1",
        expect.objectContaining({ evidence_type: "selfie", mime_type: "image/jpeg", size: 400_000 }),
      ),
    );
    await waitFor(() => expect(mockedCompleteEvidenceUpload).toHaveBeenCalledWith("ev-1"));
    expect(await findByText("Capturado")).toBeTruthy();
  });

  it("retries a failed face_match step by uploading the fresh selfie against face_match's own step, even once biometric_liveness has already passed (real physical-device case 72 regression)", async () => {
    // Case 72: identity_document and biometric_liveness had BOTH already
    // passed (immutable) by the time face_match's own probe selfie needed a
    // retry after a `no_match` verdict. Uploading against the sibling
    // biometric_liveness step (the pre-9D.3.1 target) would 409 against an
    // already-resolved step - this proves the retry now targets face_match
    // itself, which is what stays actionable.
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "failed", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "no_match" }));
    const { getByText, findByText } = await renderCompliance();

    fireEvent.press(await findByText("Volver a tomar selfie"));
    await captureAndUseSelfie(getByText, findByText);

    expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith("face-match-step-1", expect.objectContaining({ evidence_type: "selfie" }));
    expect(mockedRequestEvidenceUpload).not.toHaveBeenCalledWith("biometric-step-1", expect.anything());
  });

  it("never triggers face-match processing before the selfie evidence completes", async () => {
    const { getByText, findByText } = await renderCompliance();
    fireEvent.press(await findByText("Selfie"));
    await findByText("Toma una selfie");
    fireEvent.press(getByText("Cancelar"));

    expect(await findByText("Aún no capturado")).toBeTruthy();
    fireEvent.press(getByText("Enviar para verificación"));
    expect(mockedTriggerFaceMatchProcessing).not.toHaveBeenCalled();
  });

  it("surfaces a recoverable error, never a fake success, when the backend rejects the retry evidence upload as not-yet-actionable", async () => {
    // e.g. EvidenceUploadService::assertStepActionable() correctly refusing
    // a Failed-but-not-current face_match step (Phase 9D.3.1's narrow
    // ordering gate) - the client must show this as a normal, recoverable
    // error rather than crashing or silently marking the photo as uploaded.
    mockedRequestEvidenceUpload.mockRejectedValue(
      new ApiError("conflict", "Evidence can only be submitted while this step is still actionable.", 409),
    );
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    const { getByText, findByText, queryByText } = await renderCompliance();

    fireEvent.press((await findByText("Selfie")) as never);
    fireEvent.press((await findByText("Abrir cámara")) as never);
    fireEvent.press((await findByText("Usar esta foto")) as never);

    expect(await findByText(/still actionable/i)).toBeTruthy();
    expect(mockedCompleteEvidenceUpload).not.toHaveBeenCalled();

    // Never a client-side fake state change: back on the checklist, the
    // selfie is never shown as "Capturado" off the back of a rejected
    // authorize call, and Retake still works normally.
    fireEvent.press(getByText("Volver a tomar"));
    await findByText("Toma una selfie");
    fireEvent.press(getByText("Cancelar"));
    expect(await findByText("Aún no capturado")).toBeTruthy();
    expect(queryByText("Capturado")).toBeNull();
  });

  it("surfaces a clean error and keeps the local photo when the direct PUT fails", async () => {
    mockFileUpload.mockResolvedValue({ status: 500, headers: {}, body: "" });
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    const { findByText } = await renderCompliance();

    // Deliberately not using captureAndUseSelfie() here -- that helper waits
    // for "Captured" to appear, which never happens on a failed upload; this
    // test is specifically about the local photo staying on-screen instead.
    fireEvent.press((await findByText("Selfie")) as never);
    fireEvent.press((await findByText("Abrir cámara")) as never);
    fireEvent.press((await findByText("Usar esta foto")) as never);

    expect(await findByText(/la carga no se completó/i)).toBeTruthy();
    expect(mockedCompleteEvidenceUpload).not.toHaveBeenCalled();
  });

  it("declares the real final on-disk file size to the backend, never expo-image-picker's own estimate", async () => {
    // A real physical-device bug: expo-image-picker's reported asset.fileSize
    // can diverge from the file actually written to disk at asset.uri. Set
    // these to two DIFFERENT values here specifically to prove the value
    // sent to requestEvidenceUpload always comes from the real file (what
    // the mock's `new File(uri).size` getter reports), never the camera's
    // own estimate -- exactly what the backend's own object-size
    // verification at complete() time requires.
    mockFileSize = 512_345;
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith("face-match-step-1", expect.objectContaining({ size: 512_345 }));
  });

  it("clears the stuck loading state and re-enables Retake when the backend rejects at completion (e.g. a size mismatch)", async () => {
    // Mirrors the real EvidenceUploadService::complete() rejection
    // ("the uploaded object size does not match what was declared") --
    // the PUT itself succeeds, but complete() throws. A prior version of
    // useEvidenceUploadFlow only reset `stage` back to "idle" on the
    // explicit PUT-failure branch, so this exact rejection left `stage`
    // stuck at "completing" forever, permanently disabling Retake/Retry.
    mockedCompleteEvidenceUpload.mockRejectedValue(new ApiError("validation", "Evidence verification failed: the uploaded object size does not match what was declared."));
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    const { getByText, findByText } = await renderCompliance();

    fireEvent.press((await findByText("Selfie")) as never);
    fireEvent.press((await findByText("Abrir cámara")) as never);
    fireEvent.press((await findByText("Usar esta foto")) as never);

    expect(await findByText(/does not match what was declared/i)).toBeTruthy();

    // A disabled Button's Pressable never fires onPress (see this file's
    // other tests for the same established assertion pattern) -- reaching
    // "Toma una selfie" here is only possible if Retake was actually
    // enabled, i.e. `uploadFlow.stage` really did return to "idle" after
    // the rejection above, not left stuck at "completing".
    fireEvent.press(getByText("Volver a tomar"));
    expect(await findByText("Toma una selfie")).toBeTruthy();
  });

  it("never logs the file's bytes, the presigned URL, or any upload header -- only safe diagnostics", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    for (const call of logSpy.mock.calls) {
      const raw = JSON.stringify(call);
      expect(raw).not.toContain("file:///tmp/selfie.jpg");
      expect(raw).not.toContain(uploadAuthorization().upload.url);
      expect(raw).not.toContain("Content-Type");
    }
    logSpy.mockRestore();
  });
});

// --- Processing / polling ---------------------------------------------------------

describe("Face match: processing and polling", () => {
  it("shows Waiting/Comparing states and stops polling once completed", async () => {
    jest.useFakeTimers();
    try {
      mockedFetchFaceMatchResult
        .mockResolvedValueOnce(faceMatchResult({ status: "pending" }))
        .mockResolvedValueOnce(faceMatchResult({ status: "processing" }))
        .mockResolvedValue(faceMatchResult({ status: "completed", verdict: "match" }));

      const { findByText } = await renderCompliance();

      expect(await findByText("Esperando la selfie")).toBeTruthy();
      const firstCallCount = mockedFetchFaceMatchResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(await findByText("Comparando tu selfie")).toBeTruthy();
      expect(mockedFetchFaceMatchResult.mock.calls.length).toBeGreaterThan(firstCallCount);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await findByText("Rostro coincidente");
      const callsAfterCompleted = mockedFetchFaceMatchResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(9000);
      });
      expect(mockedFetchFaceMatchResult.mock.calls.length).toBe(callsAfterCompleted);
    } finally {
      jest.useRealTimers();
    }
  });

  it("disables Submit while a trigger request is in-flight, never firing a duplicate", async () => {
    let resolveTrigger!: (value: FaceMatchProcessingResult) => void;
    mockedTriggerFaceMatchProcessing.mockReturnValue(
      new Promise((resolve) => {
        resolveTrigger = resolve;
      }),
    );
    const { getByText, findByText, queryByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    // A single press -- a second real fireEvent.press() on this same
    // button (even one the guard turns into a no-op) reliably corrupted
    // react-test-renderer's shared act() scope for the rest of this file
    // (every subsequent findBy* then hung to its own timeout), for reasons
    // that trace into react-test-renderer/RTL's own event handling rather
    // than any bug in submittingRef's guard. Verifying that the button
    // itself goes into a disabled/loading state after one press (Button
    // swaps its label for a spinner and sets accessibilityState.disabled
    // while `loading`) demonstrates the same guarantee -- a second real
    // tap has nothing to hit -- without needing to actually fire one.
    fireEvent.press(getByText("Enviar para verificación"));
    await waitFor(() => expect(queryByText("Enviar para verificación")).toBeNull());

    await act(async () => {
      resolveTrigger(faceMatchResult({ status: "pending" }));
    });

    expect(mockedTriggerFaceMatchProcessing).toHaveBeenCalledTimes(1);
  });

  it("recovers an existing in-flight result after a remount (app reopen)", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "processing" }));
    const { findByText, rerender } = await renderCompliance();
    expect(await findByText("Comparando tu selfie")).toBeTruthy();

    // Simulate "app reopen" by remounting the screen -- a changed `key`
    // forces React to unmount the old tree and mount a fresh one (no local
    // component state survives), while staying on the SAME test-renderer
    // root via `rerender` rather than creating a second one via a second
    // render() call. A genuinely separate render() root here left a real,
    // still-firing refetchInterval timer (status stays "processing", never
    // reaching a terminal value) that corrupted react-test-renderer's
    // act() scope for every later test in this file (surfaced as
    // "overlapping act() calls" and every subsequent findBy* hanging to
    // its own timeout) -- rerender()ing in place avoids that entirely.
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue()}>
            <ComplianceScreen key="reopened" />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("Comparando tu selfie")).toBeTruthy();
  });
});

// --- 503 operational unavailability ------------------------------------------------

describe("Face match: 503 operational unavailability at trigger", () => {
  it("shows a distinct temporarily-unavailable message, never a biometric-mismatch message, and never auto-retries", async () => {
    mockedTriggerFaceMatchProcessing.mockRejectedValue(
      new ApiError("server", "Face-match processing is temporarily unavailable - please try again later.", 503),
    );
    const { getByText, findByText, queryByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    fireEvent.press(getByText("Enviar para verificación"));

    expect(await findByText(/no está disponible temporalmente/i)).toBeTruthy();
    expect(queryByText(/no_match|no se pudo confirmar|fraude/i)).toBeNull();
    expect(mockedTriggerFaceMatchProcessing).toHaveBeenCalledTimes(1);
  });
});

describe("Face match: missing document prerequisite (409)", () => {
  it("shows safe guidance distinct from the duplicate-in-progress 409, never silently retried", async () => {
    mockedTriggerFaceMatchProcessing.mockRejectedValue(
      new ApiError(
        "conflict",
        "No completed identity-document result exists yet to source a reference portrait from - complete identity document processing first.",
        409,
      ),
    );
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    fireEvent.press(getByText("Enviar para verificación"));

    expect(await findByText(/completa primero la verificación de tu documento de identidad/i)).toBeTruthy();
  });

  it("silently recovers (no error shown) for a duplicate-in-progress 409", async () => {
    mockedTriggerFaceMatchProcessing.mockRejectedValue(
      new ApiError("conflict", "A face-match processing attempt is already in progress for this step.", 409),
    );
    const { getByText, findByText, queryByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    // Only NOW simulate the in-flight attempt the 409 reveals -- the hook
    // invalidates the result query on any 409, and this is what that
    // refetch turns up. Seeding this before the initial render (an earlier
    // version of this test did) had the screen show the processing state
    // from the very first render, so captureAndUseSelfie's checklist
    // ("Selfie") never appeared at all.
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "processing" }));
    fireEvent.press(getByText("Enviar para verificación"));

    expect(await findByText("Comparando tu selfie")).toBeTruthy();
    expect(queryByText(/completa primero la verificación de tu documento/i)).toBeNull();
  });
});

// --- Result semantics --------------------------------------------------------------

describe("Face match: result UX", () => {
  it("shows 'Face matched', never 'Identity verified', and no retry action for a match", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "match" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Rostro coincidente")).toBeTruthy();
    expect(queryByText(/identidad verificada/i)).toBeNull();
    expect(queryByText("Volver a tomar selfie")).toBeNull();
  });

  it("shows a no_match message and offers a retake", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "no_match" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("No se pudo confirmar la coincidencia")).toBeTruthy();
    expect(await findByText("Volver a tomar selfie")).toBeTruthy();
  });

  it("shows a review message, no retry action, and never converts review to pass or fail", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "review" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Necesita revisión")).toBeTruthy();
    expect(queryByText("Volver a tomar selfie")).toBeNull();
    expect(queryByText("Rostro coincidente")).toBeNull();
    expect(queryByText("No se pudo confirmar la coincidencia")).toBeNull();
  });

  it("maps no_face_probe to selfie-centering guidance with a retake action", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "no_face_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/no pudimos detectar tu rostro claramente/i)).toBeTruthy();
    expect(await findByText("Volver a tomar selfie")).toBeTruthy();
  });

  it("maps multiple_faces_probe to a 'only you' message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "multiple_faces_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/solo tú aparezcas en la foto/i)).toBeTruthy();
  });

  it("maps face_too_small_probe to a 'move closer' message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "face_too_small_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/acércate un poco más/i)).toBeTruthy();
  });

  it("never blames the selfie for a reference-side (document) failure, but still offers a retry so the affiliate is never stuck with no action", async () => {
    // Real physical-device bug (compliance case 72): identity_document and
    // biometric_liveness both already `passed` (neither offers a recapture
    // action once resolved), and a reference-side face_match failure used
    // to withhold the retry button entirely -- leaving a failed, current,
    // actionable step with literally nothing clickable anywhere in the
    // app. The message still correctly points at the identity document,
    // never claiming the selfie itself was the problem, but a retry is
    // always offered now -- the backend's own trigger() gate remains the
    // authoritative check if the reference genuinely still can't be used.
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "no_face_reference" }));
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText(/documento de identidad/i)).toBeTruthy();
    expect(await findByText("Volver a tomar selfie")).toBeTruthy();
    expect(queryByText(/no pudimos detectar tu rostro claramente/i)).toBeNull();
  });

  it("shows review-required copy for an ambiguous document reference (Phase 9D.4), never a retry loop", async () => {
    // Real physical-device finding: a genuine INE with two similarly-
    // confident candidate faces fails the document-reference selection
    // rule. Unlike no_face_reference/multiple_faces_reference (still a
    // retryable technical failure - see the test above), this is a genuine
    // dead end for a selfie retry: the backend resolves it into
    // Compliance's manual-review pathway instead, so the affiliate must
    // never be shown a "Retake selfie" loop or told to fix their document.
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "ambiguous_document_reference" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Necesita revisión")).toBeTruthy();
    expect(await findByText(/no pudimos verificar automáticamente el retrato de tu identificación/i)).toBeTruthy();
    expect(queryByText("Volver a tomar selfie")).toBeNull();
    expect(queryByText(/revisa el paso de documento de identidad/i)).toBeNull();
    expect(queryByText(/volver a capturarse o procesarse/i)).toBeNull();
  });

  it("keeps showing review-required copy (never 'matched') once the step itself resolves to passed for an ambiguous document reference", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ status: "passed", configured_provider: "afilianet", provider_actionable: true }),
      biometricStep({ status: "passed" }),
    ]);
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "ambiguous_document_reference", verdict: null }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Necesita revisión")).toBeTruthy();
    expect(await findByText(/no pudimos verificar automáticamente el retrato de tu identificación/i)).toBeTruthy();
    expect(queryByText("Tu rostro coincidió con tu documento de identidad.")).toBeNull();
    expect(queryByText("Volver a tomar selfie")).toBeNull();
  });

  it("retrying after a reference-side failure clears the stale result and returns to a fresh, uploadable capture checklist", async () => {
    mockedFetchFaceMatchResult.mockResolvedValueOnce(faceMatchResult({ id: "fm-result-stale", status: "failed", failure_reason: "no_face_reference" }));
    const { getByText, findByText, queryByText } = await renderCompliance();
    await findByText(/documento de identidad/i);

    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ id: "fm-result-stale", status: "failed", failure_reason: "no_face_reference" }));
    fireEvent.press(getByText("Volver a tomar selfie"));

    // Back on the checklist, no stale "Capturado"/result banner left over.
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Aún no capturado")).toBeTruthy();
    expect(queryByText(/documento de identidad/i)).toBeNull();

    await captureAndUseSelfie(getByText, findByText);
    expect(await findByText("Capturado")).toBeTruthy();
  });

  it("maps an engine-unavailable technical failure to a temporarily-unavailable message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "unreachable" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/no está disponible temporalmente/i)).toBeTruthy();
  });

  it("never renders a raw similarity score or internal failure_reason string", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "no_face_probe" }));
    const { queryByText } = await renderCompliance();
    await waitFor(() => expect(queryByText(/no_face_probe/i)).toBeNull());
    expect(queryByText(/0\.\d+/)).toBeNull();
  });
});

// --- Compliance semantics -----------------------------------------------------------

describe("Face match: Compliance semantics", () => {
  it("never calls attemptComplianceStep -- the backend alone resolves the step", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "match" }));
    await renderCompliance();
    await waitFor(() => expect(mockedFetchFaceMatchResult).toHaveBeenCalled());
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();
  });
});

// --- Tenant isolation ----------------------------------------------------------------

describe("Face match: tenant isolation", () => {
  it("resets all local selfie/capture/result state and stops polling when the organization changes", async () => {
    mockedFetchFaceMatchResult.mockRejectedValue(NOT_FOUND);
    const { getByText, findByText, rerender } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);
    expect(await findByText("Capturado")).toBeTruthy();

    mockedFetchComplianceSteps.mockResolvedValue([faceMatchStep({ id: "step-org-b" }), biometricStep({ id: "biometric-org-b" })]);
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("Aún no capturado")).toBeTruthy();
  });
});

// --- Privacy -------------------------------------------------------------------------

describe("Face match: privacy", () => {
  it("never sends selfie/evidence/result details to analytics", async () => {
    // No pre-seeded result here -- this test is about the CAPTURE flow's
    // own analytics events (face_match_selfie_captured), not the result
    // screen, so it needs the default no-result-yet state for the capture
    // checklist to render at all. Seeding a "completed" result upfront (an
    // earlier version of this test did) shows the result screen from the
    // first render instead, and captureAndUseSelfie's checklist ("Selfie")
    // never appears.
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    for (const call of mockedCapture.mock.calls) {
      expect(call.length).toBeLessThanOrEqual(1);
      const raw = JSON.stringify(call);
      expect(raw).not.toContain("file:///tmp/selfie.jpg");
      expect(raw).not.toContain("ev-1");
      expect(raw).not.toContain("face-match-step-1");
    }
  });

  it("never mixes the Fake development simulator into the real capture flow", async () => {
    const { findByText, findAllByText } = await renderCompliance();
    // The real capture checklist and the dev simulator both render, but as
    // separate, clearly distinct sections -- the simulator never appears
    // INSIDE the selfie checklist/capture screen itself. Both the
    // face_match AND biometric_liveness steps render their own
    // DevelopmentStepSimulator, so this is deliberately findAllByText, not
    // findByText (which requires exactly one match).
    expect(await findByText("Selfie")).toBeTruthy();
    expect((await findAllByText("Development simulator")).length).toBeGreaterThanOrEqual(1);
  });
});
