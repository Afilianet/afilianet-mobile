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

async function chooseIne(getByText: (text: string) => unknown, findByText: (text: RegExp | string) => Promise<unknown>) {
  fireEvent.press((await findByText("Mexican INE")) as never);
  await findByText("Front");
}

describe("Document capture: document type selection", () => {
  it("offers only mx_ine and passport, with their real requirements", async () => {
    const { findByText } = await renderCompliance();
    expect(await findByText("Which document will you provide?")).toBeTruthy();
    expect(await findByText("Mexican INE")).toBeTruthy();
    expect(await findByText("Passport")).toBeTruthy();
    expect(await findByText("Requires: Front + Back")).toBeTruthy();
    expect(await findByText("Requires: Identity page")).toBeTruthy();
  });

  it("shows a front/back checklist for mx_ine", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    expect(await findByText("Front")).toBeTruthy();
    expect(await findByText("Back")).toBeTruthy();
    expect(await findByText("Submit for verification")).toBeTruthy();
  });

  it("shows a single identity-page checklist for passport", async () => {
    const { getByText, findByText } = await renderCompliance();
    fireEvent.press(await findByText("Passport"));
    expect(await findByText("Identity page")).toBeTruthy();
    expect(getByText("Submit for verification")).toBeTruthy();
  });
});

describe("Document capture: camera permission and capture", () => {
  it("shows a permission-denied state and lets the user open settings", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "denied" });
    const settingsSpy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined as never);

    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Front"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Camera access needed")).toBeTruthy();
    fireEvent.press(getByText("Open settings"));
    expect(settingsSpy).toHaveBeenCalledTimes(1);
    settingsSpy.mockRestore();
  });

  it("shows an unavailable state when the camera itself fails to launch", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockRejectedValue(new Error("no camera hardware"));

    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Front"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Camera unavailable")).toBeTruthy();
  });

  it("returns to guidance without an error when the user cancels the native camera", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });

    const { getByText, findByText, queryByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Front"));
    fireEvent.press(await findByText("Open camera"));

    await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalledTimes(1));
    expect(queryByText(/couldn't be captured|error/i)).toBeNull();
    expect(await findByText("Open camera")).toBeTruthy();
  });

  it("previews a captured photo and supports retake before uploading", async () => {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/front-1.jpg", width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
    });

    const { getByText, findByText, queryByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    fireEvent.press(getByText("Front"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Retake")).toBeTruthy();
    expect(await findByText("Use this photo")).toBeTruthy();
    expect(mockedRequestEvidenceUpload).not.toHaveBeenCalled();

    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/front-2.jpg", width: 1200, height: 800, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Retake"));
    expect(await findByText("Open camera")).toBeTruthy();
    expect(queryByText("Use this photo")).toBeNull();
  });
});

describe("Document capture: upload flow (Phase 9B real endpoints)", () => {
  async function captureAndUse(getByText: (text: string) => unknown, findByText: (text: RegExp | string) => Promise<unknown>) {
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/front.jpg", width: 1200, height: 800, fileSize: 500_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Front") as never);
    fireEvent.press((await findByText("Open camera")) as never);
    fireEvent.press((await findByText("Use this photo")) as never);
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
    expect(await findByText("Captured")).toBeTruthy();
  });

  it("does not enable Submit until every required side is uploaded", async () => {
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText); // front only -- back still missing
    await findByText("Captured");

    fireEvent.press(getByText("Submit for verification"));
    // A disabled Button's Pressable never fires onPress -- triggering stays
    // uncalled until the still-missing "Back" side is captured too.
    expect(mockedTriggerDocumentProcessing).not.toHaveBeenCalled();
  });

  it("surfaces a clean error and keeps the local photo when the direct PUT fails", async () => {
    mockFileUpload.mockResolvedValue({ status: 500, headers: {}, body: "" });
    const { getByText, findByText } = await renderCompliance();
    await chooseIne(getByText, findByText);
    await captureAndUse(getByText, findByText);

    expect(await findByText(/upload didn't complete/i)).toBeTruthy();
    expect(mockedCompleteEvidenceUpload).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
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
      expect(await findByText("Waiting for document")).toBeTruthy();
      const firstCallCount = mockedFetchDocumentResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(await findByText("Processing your document")).toBeTruthy();
      expect(mockedFetchDocumentResult.mock.calls.length).toBeGreaterThan(firstCallCount);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await findByText("Confirmed from document");
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

    expect(await findByText("First name")).toBeTruthy();
    expect(await findByText("JUAN CARLOS")).toBeTruthy();
    expect(await findByText("CURP")).toBeTruthy();
    expect(await findByText("PEGJ900515HDFRZN08")).toBeTruthy();
    expect(await findByText("Date of birth")).toBeTruthy();
    expect(await findByText("May 15, 1990")).toBeTruthy();

    // Never a raw backend check/field name or processor internal.
    expect(queryByText(/curp_format|front_present|required_fields_present/i)).toBeNull();
    expect(queryByText(/0\.97|0\.79/)).toBeNull();
  });

  it("never offers a Save/Confirm action -- the backend confirmation endpoint does not exist", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({
        status: "completed",
        verdict: "review",
        extracted_fields: [{ name: "curp", value: "PEGJ900515HDFRZNO8", confidence: 0.79, confirmation_required: true }],
      }),
    );

    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Please review")).toBeTruthy();
    expect(queryByText(/^Save$/i)).toBeNull();
    expect(queryByText(/^Confirm$/i)).toBeNull();
    expect(queryByText(/save changes/i)).toBeNull();
  });

  it("verdict: fail offers Try again, which returns to the capture checklist for the same document type", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "fail", document_type: "mx_ine" }));

    const { findByText, findAllByText } = await renderCompliance();

    expect(await findByText("Needs correction")).toBeTruthy();
    fireEvent.press(await findByText("Try again"));
    // document_type was recovered from the existing result -- no need to
    // re-choose it, straight to the mx_ine checklist, both sides reset.
    expect(await findByText("Front")).toBeTruthy();
    expect(await findByText("Back")).toBeTruthy();
    expect((await findAllByText("Not yet captured")).length).toBe(2);
  });
});

describe("Document capture: technical failure and manual review", () => {
  it("maps poor_image_quality to a retake-oriented message", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "poor_image_quality" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/retake it with better lighting/i)).toBeTruthy();
  });

  it("maps an unavailable OCR engine to a distinct, non-blaming message", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "failed", failure_reason: "ocr_unavailable" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/temporarily unavailable/i)).toBeTruthy();
  });

  it("shows a manual-review waiting state, with no retry button, when verdict is review", async () => {
    mockedFetchDocumentResult.mockResolvedValue(documentResult({ status: "completed", verdict: "review" }));
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Please review")).toBeTruthy();
    expect(await findByText(/manual review/i)).toBeTruthy();
    expect(queryByText("Try again")).toBeNull();
  });
});

describe("Document capture: provider awareness", () => {
  it("never shows the Afilianet capture flow when the step's provider is incode", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ provider: "incode" })]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/different flow/i)).toBeTruthy();
    expect(queryByText("Which document will you provide?")).toBeNull();
    expect(mockedFetchDocumentResult).not.toHaveBeenCalled();
  });

  it("shows the real capture flow when provider is null (unattempted) or a Fake label", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ provider: "fake-identity" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Which document will you provide?")).toBeTruthy();
  });
});

describe("Document capture: tenant isolation", () => {
  it("resets all local capture state and stops polling when the organization changes", async () => {
    mockedFetchDocumentResult.mockRejectedValue(NOT_FOUND);
    const { getByText, findByText, rerender } = await renderCompliance();
    await chooseIne(getByText, findByText);
    expect(await findByText("Front")).toBeTruthy();

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

    // Back to the type selector for the new organization -- no stale "Front"
    // checklist or captured-evidence state survives the switch.
    expect(await findByText("Which document will you provide?")).toBeTruthy();
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
    fireEvent.press(getByText("Front"));
    fireEvent.press(await findByText("Open camera"));
    fireEvent.press(await findByText("Use this photo"));
    await findByText("Captured");

    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1); // event name only, no properties object
      expect(JSON.stringify(call)).not.toMatch(/step-1|ev-1|id_document_front|file:\/\/\/tmp/i);
    }
  });
});
