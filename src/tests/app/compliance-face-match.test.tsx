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
 * Phase 9D.3: the real self-service face-match flow (Compliance
 * face_match step -> provider gate -> selfie capture -> Evidence upload
 * against the sibling biometric_liveness step -> face-match-processing ->
 * poll -> result). Mirrors compliance-document-capture.test.tsx's exact
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
jest.mock("expo-file-system", () => ({
  // A plain class, not a jest.fn() -- jest.resetAllMocks() (used in
  // beforeEach below) would otherwise wipe a jest.fn().mockImplementation()
  // set once here at module-mock time and never re-established per test.
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
  fireEvent.press((await findByText("Open camera")) as never);
  fireEvent.press((await findByText("Use this photo")) as never);
  await findByText("Captured");
}

// --- Provider awareness -------------------------------------------------------

describe("Face match: provider awareness", () => {
  it("shows the real selfie-capture flow when configured_provider is afilianet and actionable", async () => {
    const { findByText } = await renderCompliance();
    expect(await findByText("Selfie")).toBeTruthy();
    expect(await findByText("Submit for verification")).toBeTruthy();
  });

  it("never shows the Afilianet selfie flow when configured_provider is incode", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: "incode", provider_actionable: false, provider_unavailable_reason: null }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/uses a different flow/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(mockedFetchFaceMatchResult).not.toHaveBeenCalled();
  });

  it("shows a safe unavailable state, never the capture flow, when afilianet is configured but not actionable", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: "afilianet", provider_actionable: false, provider_unavailable_reason: "engine_unavailable" }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/face verification is temporarily unavailable/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
    expect(mockedFetchFaceMatchResult).not.toHaveBeenCalled();
  });

  it("never assumes Afilianet or Fake for an unconfigured/null provider", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      faceMatchStep({ configured_provider: null, provider_actionable: false, provider_unavailable_reason: "not_configured" }),
      biometricStep(),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/isn't set up for this organization yet/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
  });

  it("never lets the client select a provider -- trigger sends no provider field", async () => {
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);
    fireEvent.press(getByText("Submit for verification"));

    await waitFor(() => expect(mockedTriggerFaceMatchProcessing).toHaveBeenCalledWith("face-match-step-1"));
  });
});

describe("Face match: missing biometric_liveness sibling step", () => {
  it("shows a safe unavailable state when the org has no biometric_liveness step to upload a selfie against", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([faceMatchStep()]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/isn't fully set up for this organization yet/i)).toBeTruthy();
    expect(queryByText("Selfie")).toBeNull();
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
    expect(await findByText("Take a selfie")).toBeTruthy();
    expect(await findByText(/look directly at the camera/i)).toBeTruthy();

    fireEvent.press(await findByText("Open camera"));
    expect(mockRequestCameraPermission).toHaveBeenCalled();
    expect(await findByText("Use this photo")).toBeTruthy();
  });

  it("shows a permission-denied state and lets the user open settings", async () => {
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Camera access needed")).toBeTruthy();
    expect(await findByText("Open settings")).toBeTruthy();
  });

  it("shows an unavailable state when the camera itself fails to launch", async () => {
    const { findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockRejectedValue(new Error("no camera"));

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Camera unavailable")).toBeTruthy();
  });

  it("returns to guidance without an error when the user cancels the native camera", async () => {
    const { findByText, queryByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Open camera"));

    expect(await findByText("Open camera")).toBeTruthy();
    expect(queryByText(/couldn't be read|corrupted/i)).toBeNull();
  });

  it("supports retake before uploading", async () => {
    const { getByText, findByText } = await renderCompliance();
    mockRequestCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie-1.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });

    fireEvent.press(await findByText("Selfie"));
    fireEvent.press(await findByText("Open camera"));
    expect(await findByText("Use this photo")).toBeTruthy();
    expect(mockedRequestEvidenceUpload).not.toHaveBeenCalled();

    mockLaunchCamera.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/selfie-2.jpg", width: 1200, height: 1200, fileSize: 400_000, mimeType: "image/jpeg" }],
    });
    fireEvent.press(getByText("Retake"));
    expect(await findByText("Open camera")).toBeTruthy();
  });

  it("cancels out of the capture screen back to the checklist", async () => {
    const { getByText, findByText, queryByText } = await renderCompliance();
    fireEvent.press(await findByText("Selfie"));
    expect(await findByText("Take a selfie")).toBeTruthy();

    fireEvent.press(getByText("Cancel"));
    expect(await findByText("Selfie")).toBeTruthy();
    expect(queryByText("Take a selfie")).toBeNull();
  });
});

// --- Evidence upload -------------------------------------------------------------

describe("Face match: selfie evidence upload", () => {
  it("uploads against the biometric_liveness step id, never face_match's own", async () => {
    const { getByText, findByText } = await renderCompliance();
    await captureAndUseSelfie(getByText, findByText);

    await waitFor(() =>
      expect(mockedRequestEvidenceUpload).toHaveBeenCalledWith(
        "biometric-step-1",
        expect.objectContaining({ evidence_type: "selfie", mime_type: "image/jpeg", size: 400_000 }),
      ),
    );
    await waitFor(() => expect(mockedCompleteEvidenceUpload).toHaveBeenCalledWith("ev-1"));
    expect(await findByText("Captured")).toBeTruthy();
  });

  it("never triggers face-match processing before the selfie evidence completes", async () => {
    const { getByText, findByText } = await renderCompliance();
    fireEvent.press(await findByText("Selfie"));
    await findByText("Take a selfie");
    fireEvent.press(getByText("Cancel"));

    expect(await findByText("Not yet captured")).toBeTruthy();
    fireEvent.press(getByText("Submit for verification"));
    expect(mockedTriggerFaceMatchProcessing).not.toHaveBeenCalled();
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
    fireEvent.press((await findByText("Open camera")) as never);
    fireEvent.press((await findByText("Use this photo")) as never);

    expect(await findByText(/upload didn't complete/i)).toBeTruthy();
    expect(mockedCompleteEvidenceUpload).not.toHaveBeenCalled();
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

      expect(await findByText("Waiting for selfie")).toBeTruthy();
      const firstCallCount = mockedFetchFaceMatchResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(await findByText("Comparing your selfie")).toBeTruthy();
      expect(mockedFetchFaceMatchResult.mock.calls.length).toBeGreaterThan(firstCallCount);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await findByText("Face matched");
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
    fireEvent.press(getByText("Submit for verification"));
    await waitFor(() => expect(queryByText("Submit for verification")).toBeNull());

    await act(async () => {
      resolveTrigger(faceMatchResult({ status: "pending" }));
    });

    expect(mockedTriggerFaceMatchProcessing).toHaveBeenCalledTimes(1);
  });

  it("recovers an existing in-flight result after a remount (app reopen)", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "processing" }));
    const { findByText, rerender } = await renderCompliance();
    expect(await findByText("Comparing your selfie")).toBeTruthy();

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

    expect(await findByText("Comparing your selfie")).toBeTruthy();
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

    fireEvent.press(getByText("Submit for verification"));

    expect(await findByText(/face verification is temporarily unavailable/i)).toBeTruthy();
    expect(queryByText(/no_match|couldn't confirm|fraud/i)).toBeNull();
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

    fireEvent.press(getByText("Submit for verification"));

    expect(await findByText(/complete your identity document verification first/i)).toBeTruthy();
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
    fireEvent.press(getByText("Submit for verification"));

    expect(await findByText("Comparing your selfie")).toBeTruthy();
    expect(queryByText(/complete your identity document/i)).toBeNull();
  });
});

// --- Result semantics --------------------------------------------------------------

describe("Face match: result UX", () => {
  it("shows 'Face matched', never 'Identity verified', and no retry action for a match", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "match" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Face matched")).toBeTruthy();
    expect(queryByText(/identity verified/i)).toBeNull();
    expect(queryByText("Retake selfie")).toBeNull();
  });

  it("shows a no_match message and offers a retake", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "no_match" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("Couldn't confirm the match")).toBeTruthy();
    expect(await findByText("Retake selfie")).toBeTruthy();
  });

  it("shows a review message, no retry action, and never converts review to pass or fail", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "completed", verdict: "review" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Needs review")).toBeTruthy();
    expect(queryByText("Retake selfie")).toBeNull();
    expect(queryByText("Face matched")).toBeNull();
    expect(queryByText("Couldn't confirm the match")).toBeNull();
  });

  it("maps no_face_probe to selfie-centering guidance with a retake action", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "no_face_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/couldn't clearly detect your face/i)).toBeTruthy();
    expect(await findByText("Retake selfie")).toBeTruthy();
  });

  it("maps multiple_faces_probe to a 'only you' message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "multiple_faces_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/only you are visible/i)).toBeTruthy();
  });

  it("maps face_too_small_probe to a 'move closer' message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "face_too_small_probe" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/move a little closer/i)).toBeTruthy();
  });

  it("never blames the selfie for a reference-side (document) failure, and offers no selfie retake", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "no_face_reference" }));
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText(/identity document/i)).toBeTruthy();
    expect(queryByText("Retake selfie")).toBeNull();
    expect(queryByText(/couldn't clearly detect your face/i)).toBeNull();
  });

  it("maps an engine-unavailable technical failure to a temporarily-unavailable message", async () => {
    mockedFetchFaceMatchResult.mockResolvedValue(faceMatchResult({ status: "failed", failure_reason: "unreachable" }));
    const { findByText } = await renderCompliance();
    expect(await findByText(/temporarily unavailable/i)).toBeTruthy();
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
    expect(await findByText("Captured")).toBeTruthy();

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

    expect(await findByText("Not yet captured")).toBeTruthy();
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
