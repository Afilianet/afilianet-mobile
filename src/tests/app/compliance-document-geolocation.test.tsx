import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
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
  submitComplianceGeolocation,
  triggerDocumentProcessing,
} from "../../api/endpoints";
import { captureException } from "../../services/sentry";
import { analytics } from "../../services/analytics";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type {
  AffiliateProfile,
  ComplianceCase,
  ComplianceGeolocationObservation,
  ComplianceStep,
  DocumentProcessingResult,
  Organization,
} from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * Phase 9F.2: the optional, consented geolocation observation attached to
 * one identity_document capture attempt. Mirrors
 * compliance-document-capture.test.tsx's rendering/mocking setup exactly
 * (same ComplianceScreen render, same endpoint/analytics/camera mocks) --
 * this file only adds expo-location + submitComplianceGeolocation coverage
 * on top of it.
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
  triggerDocumentProcessing: jest.fn(),
  fetchDocumentResult: jest.fn(),
  submitComplianceGeolocation: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

jest.mock("../../services/sentry", () => ({
  captureException: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" }),
  launchCameraAsync: jest.fn(),
  CameraType: { back: "back", front: "front" },
}));

jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return 500_000;
    }
    upload() {
      return Promise.resolve({ status: 200, headers: {} });
    }
    delete() {
      // no-op
    }
  },
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock("expo-image", () => {
  const { Image: RNImage } = jest.requireActual("react-native");
  return { Image: RNImage };
});

const mockHasServicesEnabled = jest.fn();
const mockRequestForegroundPermissions = jest.fn();
const mockGetCurrentPosition = jest.fn();
jest.mock("expo-location", () => ({
  hasServicesEnabledAsync: (...args: unknown[]) => mockHasServicesEnabled(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissions(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPosition(...args),
  Accuracy: { Balanced: 3 },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.9.0" } },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;
const mockedRequestEvidenceUpload = requestEvidenceUpload as jest.Mock;
const mockedCompleteEvidenceUpload = completeEvidenceUpload as jest.Mock;
const mockedTriggerDocumentProcessing = triggerDocumentProcessing as jest.Mock;
const mockedFetchDocumentResult = fetchDocumentResult as jest.Mock;
const mockedSubmitComplianceGeolocation = submitComplianceGeolocation as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;
const mockedCaptureException = captureException as jest.Mock;

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
    configured_provider: "afilianet",
    provider_actionable: true,
    provider_unavailable_reason: null,
    ...overrides,
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

function geolocationObservation(overrides: Partial<ComplianceGeolocationObservation> = {}): ComplianceGeolocationObservation {
  return {
    id: "geo-1",
    permission_status: "granted",
    capture_status: "captured",
    attempt_number: 1,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

const CAPTURED_LATITUDE = 19.432608;
const CAPTURED_LONGITUDE = -99.133209;
const CAPTURED_ACCURACY = 12.5;

function mockPosition() {
  return {
    coords: {
      latitude: CAPTURED_LATITUDE,
      longitude: CAPTURED_LONGITUDE,
      accuracy: CAPTURED_ACCURACY,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.parse("2026-01-01T12:00:00.000Z"),
    mocked: false,
  };
}

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
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedStartCompliance.mockResolvedValue(complianceCase());
  mockedAttemptComplianceStep.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue([step()]);
  mockedFetchDocumentResult.mockRejectedValue(NOT_FOUND);
  mockedRequestEvidenceUpload.mockResolvedValue({
    evidence: { id: "ev-1", type: "id_document_front", status: "pending_upload", provider: null, mime_type: "image/jpeg", size: 500_000, captured_at: null, retention_until: null, created_at: "2026-01-01T00:00:00Z" },
    upload: { url: "http://127.0.0.1:8000/upload", method: "PUT", headers: {}, expires_at: "2026-01-01T00:05:00Z" },
  });
  mockedCompleteEvidenceUpload.mockResolvedValue({ id: "ev-1", type: "id_document_front", status: "uploaded", provider: null, mime_type: "image/jpeg", size: 500_000, captured_at: "2026-01-01T00:00:00Z", retention_until: null, created_at: "2026-01-01T00:00:00Z" });
  mockedTriggerDocumentProcessing.mockResolvedValue(documentResult({ status: "pending" }));
  mockedSubmitComplianceGeolocation.mockResolvedValue(geolocationObservation());
  mockHasServicesEnabled.mockResolvedValue(true);
  mockRequestForegroundPermissions.mockResolvedValue({ granted: true, status: "granted" });
  mockGetCurrentPosition.mockResolvedValue(mockPosition());
});

afterEach(() => {
  queryClient.clear();
});

async function chooseDocumentType(findByText: (text: RegExp | string) => Promise<unknown>) {
  fireEvent.press((await findByText("INE mexicana")) as never);
}

describe("Document geolocation: pre-permission consent", () => {
  it("renders the explicit pre-permission explanation in Spanish before any OS permission is requested", async () => {
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);

    expect(await findByText("Ayúdanos a proteger tu cuenta")).toBeTruthy();
    expect(
      await findByText("Podemos registrar tu ubicación al verificar tu identidad. Es opcional y nos ayuda a proteger tu cuenta."),
    ).toBeTruthy();
    expect(await findByText("Permitir ubicación")).toBeTruthy();
    expect(await findByText("Continuar sin ubicación")).toBeTruthy();
    expect(mockHasServicesEnabled).not.toHaveBeenCalled();
    expect(mockRequestForegroundPermissions).not.toHaveBeenCalled();
  });

  it("continuing without location makes zero geolocation API calls (no OS permission, no submission, no fabricated denied)", async () => {
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);

    fireEvent.press(await findByText("Continuar sin ubicación"));
    // The flow continues immediately regardless.
    expect(await findByText("Frente")).toBeTruthy();
    expect(await findByText("Reverso")).toBeTruthy();

    // Give any accidental async work a chance to run, then assert nothing
    // at all was called -- not the OS permission system, not the submit
    // endpoint. There is no geolocation observation for this attempt at
    // all; that absence is the signal, never a fabricated
    // permission_status: "denied".
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockHasServicesEnabled).not.toHaveBeenCalled();
    expect(mockRequestForegroundPermissions).not.toHaveBeenCalled();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockedSubmitComplianceGeolocation).not.toHaveBeenCalled();
  });
});

describe("Document geolocation: submission contract", () => {
  it("submits the exact captured contract (no source, no location_provider) when permission is granted and a position is obtained", async () => {
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));

    // The flow already moved on to evidence capture -- proves this never gated it.
    expect(await findByText("Frente")).toBeTruthy();

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    const [submittedStepId, payload] = mockedSubmitComplianceGeolocation.mock.calls[0];
    expect(submittedStepId).toBe("step-1");
    expect(payload).toEqual({
      permission_status: "granted",
      capture_status: "captured",
      latitude: CAPTURED_LATITUDE,
      longitude: CAPTURED_LONGITUDE,
      accuracy_meters: CAPTURED_ACCURACY,
      platform: expect.stringMatching(/^(android|ios)$/),
      app_version: "1.9.0",
      captured_at: "2026-01-01T12:00:00.000Z",
    });
    expect(payload).not.toHaveProperty("source");
    expect(payload).not.toHaveProperty("location_provider");
  });

  it("submits denied+skipped, with no coordinate fields, when the OS permission is denied", async () => {
    mockRequestForegroundPermissions.mockResolvedValue({ granted: false, status: "denied" });
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));

    expect(await findByText("Frente")).toBeTruthy();

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    const [, payload] = mockedSubmitComplianceGeolocation.mock.calls[0];
    expect(payload).toEqual({ permission_status: "denied", capture_status: "skipped" });
    expect(payload).not.toHaveProperty("latitude");
    expect(payload).not.toHaveProperty("longitude");
    expect(payload).not.toHaveProperty("accuracy_meters");
    expect(payload).not.toHaveProperty("source");
  });

  it("submits unavailable+skipped, with no coordinate fields, when location services are off", async () => {
    mockHasServicesEnabled.mockResolvedValue(false);
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));

    expect(await findByText("Frente")).toBeTruthy();

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    const [, payload] = mockedSubmitComplianceGeolocation.mock.calls[0];
    expect(payload).toEqual({ permission_status: "unavailable", capture_status: "skipped" });
    expect(mockRequestForegroundPermissions).not.toHaveBeenCalled();
  });

  it("submits granted+failed with a safe failure_reason when the position request times out/fails", async () => {
    mockGetCurrentPosition.mockRejectedValue(new Error("Location request timed out"));
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));

    expect(await findByText("Frente")).toBeTruthy();

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    const [, payload] = mockedSubmitComplianceGeolocation.mock.calls[0];
    expect(payload).toEqual({ permission_status: "granted", capture_status: "failed", failure_reason: "timeout" });
    expect(payload).not.toHaveProperty("latitude");
  });

  it("never blocks the document flow when the geolocation submit endpoint itself fails (4xx/5xx/offline)", async () => {
    mockedSubmitComplianceGeolocation.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));

    // The document flow proceeds regardless of the submit's outcome.
    expect(await findByText("Frente")).toBeTruthy();
    expect(await findByText("Reverso")).toBeTruthy();

    // Rejected, but never surfaced anywhere and never crashed the render.
    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
  });
});

describe("Document geolocation: deduplication", () => {
  it("submits exactly once even if the allow button is pressed more than once", async () => {
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    const allowButton = await findByText("Permitir ubicación");
    await act(async () => {
      fireEvent.press(allowButton);
    });
    await act(async () => {
      fireEvent.press(allowButton);
    });
    await act(async () => {
      fireEvent.press(allowButton);
    });

    await findByText("Frente");
    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
  });

  it("does not submit again on an unrelated rerender after a choice was already made", async () => {
    const { findByText, rerender } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));
    await findByText("Frente");

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));

    // A genuine no-op rerender of the exact same tree (same props, nothing
    // changed) -- must never trigger a second submission, since nothing in
    // this feature resubmits on a rerender by construction (no effect ever
    // fires the submission; only an explicit button press does).
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue()}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1);
  });

  it("permits a new observation on a document-capture retry", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "fail", document_type: "mx_ine" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("Necesita corrección")).toBeTruthy();
    fireEvent.press(await findByText("Intenta de nuevo"));

    // A retry is a new attempt -- the consent screen shows again, and this
    // attempt allows, producing a real submission.
    fireEvent.press(await findByText("Permitir ubicación"));
    await findByText("Frente");

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    expect(mockedSubmitComplianceGeolocation.mock.calls[0][1]).toEqual(
      expect.objectContaining({ permission_status: "granted", capture_status: "captured" }),
    );
  });

  it("continuing without location also submits nothing on a retried attempt", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "fail", document_type: "mx_ine" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("Necesita corrección")).toBeTruthy();
    fireEvent.press(await findByText("Intenta de nuevo"));

    // This attempt continues without location -- no submission at all.
    fireEvent.press(await findByText("Continuar sin ubicación"));
    await findByText("Frente");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedSubmitComplianceGeolocation).not.toHaveBeenCalled();
  });
});

describe("Document geolocation: privacy", () => {
  it("never persists coordinates to SecureStore", async () => {
    const setItemSpy = jest.spyOn(SecureStore, "setItemAsync");
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));
    await findByText("Frente");

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("never passes coordinates to analytics, Sentry, or the console", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));
    await findByText("Frente");

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));

    expect(mockedCapture).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ latitude: expect.anything() }));
    expect(mockedCaptureException).not.toHaveBeenCalled();

    const allConsoleArgs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat();
    for (const arg of allConsoleArgs) {
      const serialized = typeof arg === "string" ? arg : JSON.stringify(arg);
      expect(serialized).not.toContain(String(CAPTURED_LATITUDE));
      expect(serialized).not.toContain(String(CAPTURED_LONGITUDE));
    }

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("never sends document/evidence details alongside the geolocation flow to analytics (zero-property convention preserved)", async () => {
    const { findByText } = await renderCompliance();
    await chooseDocumentType(findByText);
    fireEvent.press(await findByText("Permitir ubicación"));
    await findByText("Frente");

    await waitFor(() => expect(mockedSubmitComplianceGeolocation).toHaveBeenCalledTimes(1));

    for (const [, properties] of mockedCapture.mock.calls) {
      expect(properties).toBeUndefined();
    }
  });
});
