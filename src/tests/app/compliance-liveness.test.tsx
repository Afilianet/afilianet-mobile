import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { act, configure, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  attemptComplianceStep,
  createLivenessSession,
  fetchComplianceSteps,
  fetchLivenessCredentials,
  fetchLivenessResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  startCompliance,
} from "../../api/endpoints";
import { analytics } from "../../services/analytics";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type {
  AffiliateProfile,
  ComplianceCase,
  ComplianceStep,
  LivenessCredentials,
  LivenessSession,
  Organization,
} from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * Phase 9E.2: the real self-service AWS Rekognition Face Liveness flow
 * (Compliance biometric_liveness step -> provider gate -> backend session
 * -> backend-issued temporary STS credentials -> Afilianet's own native
 * capture module -> poll -> result). Mirrors compliance-face-match.test.tsx's
 * exact mocking/rendering setup, including every lesson that file's own
 * debugging history established: a synchronous notifyManager scheduler (no
 * real-timer window across an act() boundary can corrupt
 * react-test-renderer's shared act() scope for the rest of this file), a
 * per-file jest.setTimeout raise (package.json's default is shorter than
 * this file's own asyncUtilTimeout), and every test ending on a TERMINAL
 * query status (never leaving a real refetchInterval armed past the test's
 * own return).
 *
 * The native `aws-face-liveness` module is mocked entirely -- ordinary Jest
 * never touches real Swift/Kotlin/AWS SDK code, only this file's own mock
 * view, which records the latest props it was rendered with and lets a
 * test simulate a native onComplete/onError call directly.
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
  createLivenessSession: jest.fn(),
  fetchLivenessCredentials: jest.fn(),
  fetchLivenessResult: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

let latestLivenessProps: Record<string, unknown> | null = null;
jest.mock("aws-face-liveness", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    AwsFaceLivenessView: (props: Record<string, unknown>) => {
      latestLivenessProps = props;
      return (
        <View testID="mock-aws-liveness-view">
          <Text>Mock AWS Face Liveness</Text>
        </View>
      );
    },
  };
});

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;
const mockedCreateLivenessSession = createLivenessSession as jest.Mock;
const mockedFetchLivenessCredentials = fetchLivenessCredentials as jest.Mock;
const mockedFetchLivenessResult = fetchLivenessResult as jest.Mock;
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
    current_step: "biometric_liveness",
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

function livenessStep(overrides: Partial<ComplianceStep> = {}): ComplianceStep {
  return {
    id: "liveness-step-1",
    step_type: "biometric_liveness",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    configured_provider: "aws_rekognition",
    provider_actionable: true,
    provider_unavailable_reason: null,
    ...overrides,
  };
}

const DEFAULT_STEPS = [livenessStep()];

function livenessSession(overrides: Partial<LivenessSession> = {}): LivenessSession {
  return {
    id: "session-1",
    session_id: "aws-session-1",
    region: "us-east-1",
    status: "pending",
    verdict: null,
    failure_reason: null,
    attempt_number: 1,
    started_at: null,
    completed_at: null,
    expires_at: "2026-01-01T00:03:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function livenessCredentials(overrides: Partial<LivenessCredentials> = {}): LivenessCredentials {
  return {
    access_key_id: "ASIAFAKEACCESSKEY",
    secret_access_key: "fake-secret-access-key",
    session_token: "fake-session-token",
    expiration: "2026-01-01T00:15:00Z",
    session_id: "aws-session-1",
    region: "us-east-1",
    ...overrides,
  };
}

const NOT_FOUND = new ApiError("not_found", "Not Found.", 404);

configure({ asyncUtilTimeout: 15000 });
jest.setTimeout(30000);
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
  latestLivenessProps = null;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedStartCompliance.mockResolvedValue(complianceCase());
  mockedAttemptComplianceStep.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue(DEFAULT_STEPS);
  mockedFetchLivenessResult.mockRejectedValue(NOT_FOUND);
  mockedCreateLivenessSession.mockResolvedValue(livenessSession({ status: "pending" }));
  mockedFetchLivenessCredentials.mockResolvedValue(livenessCredentials());
});

async function startCapture(findByText: (text: string) => Promise<unknown>) {
  fireEvent.press((await findByText("Start check")) as never);
  await waitFor(() => expect(latestLivenessProps).not.toBeNull());
}

async function simulateComplete() {
  await act(async () => {
    (latestLivenessProps!.onComplete as (event: unknown) => void)({ nativeEvent: { sessionId: "aws-session-1" } });
  });
}

async function simulateError(code: string) {
  await act(async () => {
    (latestLivenessProps!.onError as (event: unknown) => void)({ nativeEvent: { code } });
  });
}

// --- Provider awareness -------------------------------------------------------

describe("Liveness: provider awareness", () => {
  it("shows the real capture flow when configured_provider is aws_rekognition and actionable", async () => {
    const { findByText } = await renderCompliance();
    expect(await findByText("Start check")).toBeTruthy();
    expect(mockedFetchLivenessResult).toHaveBeenCalled();
  });

  it("shows a safe unavailable state, never the capture flow, when aws_rekognition is configured but not actionable", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      livenessStep({ configured_provider: "aws_rekognition", provider_actionable: false, provider_unavailable_reason: "engine_unavailable" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/liveness verification is temporarily unavailable/i)).toBeTruthy();
    expect(queryByText("Start check")).toBeNull();
    expect(mockedCreateLivenessSession).not.toHaveBeenCalled();
    expect(mockedFetchLivenessResult).not.toHaveBeenCalled();
  });

  it("never shows the AWS capture flow when configured_provider is incode", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      livenessStep({ configured_provider: "incode", provider_actionable: false, provider_unavailable_reason: null }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/uses a different flow/i)).toBeTruthy();
    expect(queryByText("Start check")).toBeNull();
  });

  it("never shows the AWS capture flow when configured_provider is afilianet", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      livenessStep({ configured_provider: "afilianet", provider_actionable: false, provider_unavailable_reason: "provider_misconfigured" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/isn't available for this organization right now/i)).toBeTruthy();
    expect(queryByText("Start check")).toBeNull();
  });

  it("never assumes AWS or Fake for an unconfigured/null provider", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      livenessStep({ configured_provider: null, provider_actionable: false, provider_unavailable_reason: "not_configured" }),
    ]);
    const { queryByText, findByText } = await renderCompliance();
    expect(await findByText(/isn't set up for this organization yet/i)).toBeTruthy();
    expect(queryByText("Start check")).toBeNull();
  });
});

// --- Session creation / duplicate guard ---------------------------------------

describe("Liveness: session creation", () => {
  it("creates a session then fetches credentials, in that order, before presenting the native view", async () => {
    const { findByText } = await renderCompliance();
    await startCapture(findByText);

    expect(mockedCreateLivenessSession).toHaveBeenCalledWith("liveness-step-1");
    expect(mockedFetchLivenessCredentials).toHaveBeenCalledWith("liveness-step-1");
    expect(latestLivenessProps).toMatchObject({
      sessionId: "aws-session-1",
      region: "us-east-1",
      accessKeyId: "ASIAFAKEACCESSKEY",
      secretAccessKey: "fake-secret-access-key",
      sessionToken: "fake-session-token",
      expiration: "2026-01-01T00:15:00Z",
    });
  });

  it("disables Start while a session/credentials request is in-flight, never firing a duplicate", async () => {
    let resolveSession!: (value: LivenessSession) => void;
    mockedCreateLivenessSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const { findByText, queryByText } = await renderCompliance();

    fireEvent.press(await findByText("Start check"));
    await waitFor(() => expect(queryByText("Start check")).toBeNull());

    await act(async () => {
      resolveSession(livenessSession({ status: "pending" }));
    });
    await waitFor(() => expect(latestLivenessProps).not.toBeNull());

    expect(mockedCreateLivenessSession).toHaveBeenCalledTimes(1);
  });

  it("a failed/expired session recovers by calling createLivenessSession again -- the exact same action, never a distinguishable resume-vs-restart choice", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "failed", failure_reason: "session_expired" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("That check took too long and expired. Let's try again.")).toBeTruthy();
    // "Try again" only dismisses the stale failed result locally (same
    // discipline as Face Match's own "Retake selfie") -- it never
    // auto-resubmits on its own. The affiliate lands back on the
    // explanation/start screen and presses "Start check" again, which is
    // what actually calls createLivenessSession -- the backend's own
    // idempotency rule (create fresh since the old session is locally
    // expired) is what satisfies "request a new session", not any
    // client-side resume/restart branching.
    fireEvent.press(await findByText("Try again"));
    fireEvent.press(await findByText("Start check"));

    await waitFor(() => expect(mockedCreateLivenessSession).toHaveBeenCalledWith("liveness-step-1"));
  });
});

// --- Credentials secrecy -------------------------------------------------------

describe("Liveness: credential secrecy", () => {
  it("never sends credential values (or the raw session id) to analytics", async () => {
    const { findByText } = await renderCompliance();
    await startCapture(findByText);
    await simulateComplete();

    for (const call of mockedCapture.mock.calls) {
      expect(call.length).toBeLessThanOrEqual(1);
      const raw = JSON.stringify(call);
      expect(raw).not.toContain("ASIAFAKEACCESSKEY");
      expect(raw).not.toContain("fake-secret-access-key");
      expect(raw).not.toContain("fake-session-token");
      expect(raw).not.toContain("aws-session-1");
    }
  });

  it("clears credentials from the capture flow after native completion", async () => {
    const { findByText, queryByTestId } = await renderCompliance();
    await startCapture(findByText);
    expect(queryByTestId("mock-aws-liveness-view")).toBeTruthy();

    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "processing" }));
    await simulateComplete();

    expect(queryByTestId("mock-aws-liveness-view")).toBeNull();
  });

  it("clears credentials after a native error (including cancellation)", async () => {
    const { findByText, queryByTestId } = await renderCompliance();
    await startCapture(findByText);

    await simulateError("cancelled");

    expect(queryByTestId("mock-aws-liveness-view")).toBeNull();
  });

  it("clears credentials/session/result state on organization switch", async () => {
    const { findByText, queryByTestId, rerender } = await renderCompliance();
    await startCapture(findByText);
    expect(queryByTestId("mock-aws-liveness-view")).toBeTruthy();

    mockedFetchComplianceSteps.mockResolvedValue([livenessStep({ id: "liveness-step-org-b" })]);
    mockedFetchLivenessResult.mockRejectedValue(NOT_FOUND);
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(queryByTestId("mock-aws-liveness-view")).toBeNull();
    expect(await findByText("Start check")).toBeTruthy();
  });
});

// --- Capture lifecycle ----------------------------------------------------------

describe("Liveness: capture lifecycle", () => {
  it("shows the explanation copy before capture starts, never a liveness challenge instruction", async () => {
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText(/confirm that a real person is present/i)).toBeTruthy();
    expect(queryByText(/blink|smile|turn your head/i)).toBeNull();
  });

  it("returns to the start screen without an error message when the user cancels capture", async () => {
    const { findByText, queryByText } = await renderCompliance();
    await startCapture(findByText);

    await simulateError("cancelled");

    expect(await findByText("Start check")).toBeTruthy();
    expect(queryByText(/went wrong|unavailable|expired/i)).toBeNull();
  });

  it("maps a native camera-permission-denied error to safe copy and allows restarting", async () => {
    const { findByText } = await renderCompliance();
    await startCapture(findByText);

    await simulateError("camera_permission_denied");

    expect(await findByText(/needs camera access/i)).toBeTruthy();
    expect(await findByText("Start check")).toBeTruthy();
  });

  it("maps a native camera-unavailable error to safe copy", async () => {
    const { findByText } = await renderCompliance();
    await startCapture(findByText);
    await simulateError("camera_unavailable");
    expect(await findByText(/doesn't have a usable camera/i)).toBeTruthy();
  });

  it("surfaces a clean error when the credentials endpoint fails after a session was created", async () => {
    mockedFetchLivenessCredentials.mockRejectedValue(new ApiError("server", "Something went wrong on our end.", 503));
    const { findByText } = await renderCompliance();
    fireEvent.press(await findByText("Start check"));

    expect(await findByText(/something went wrong/i)).toBeTruthy();
    expect(latestLivenessProps).toBeNull();
  });
});

// --- Result / polling -----------------------------------------------------------

describe("Liveness: result UX", () => {
  it("shows 'Liveness check completed', never 'Identity verified', and no retry action for live", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "completed", verdict: "live" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Liveness check completed")).toBeTruthy();
    expect(queryByText(/identity verified/i)).toBeNull();
    expect(queryByText("Try again")).toBeNull();
  });

  it("shows a not_live message and offers a retry", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "completed", verdict: "not_live" }));
    const { findByText } = await renderCompliance();

    expect(await findByText("Couldn't confirm liveness")).toBeTruthy();
    expect(await findByText("Try again")).toBeTruthy();
  });

  it("shows a review message, no retry action, and never converts review to pass or fail", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "completed", verdict: "review" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Needs review")).toBeTruthy();
    expect(queryByText("Try again")).toBeNull();
    expect(queryByText("Liveness check completed")).toBeNull();
    expect(queryByText("Couldn't confirm liveness")).toBeNull();
  });

  it("maps a technical failure_reason to safe retry copy, never labeling it 'not_live'", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "failed", failure_reason: "provider_failed" }));
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText(/couldn't be completed/i)).toBeTruthy();
    expect(queryByText(/confirm liveness/i)).toBeNull();
    expect(await findByText("Try again")).toBeTruthy();
  });

  it("never renders a raw failure_reason string or a confidence-looking number", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "failed", failure_reason: "provider_failed" }));
    const { queryByText } = await renderCompliance();
    await waitFor(() => expect(queryByText(/provider_failed/i)).toBeNull());
    expect(queryByText(/0\.\d+/)).toBeNull();
  });

  it("polls while pending/processing and stops once terminal", async () => {
    jest.useFakeTimers();
    try {
      mockedFetchLivenessResult
        .mockResolvedValueOnce(livenessSession({ status: "pending" }))
        .mockResolvedValueOnce(livenessSession({ status: "processing" }))
        .mockResolvedValue(livenessSession({ status: "completed", verdict: "live" }));

      const { findByText } = await renderCompliance();
      expect(await findByText("Preparing your check")).toBeTruthy();
      const firstCallCount = mockedFetchLivenessResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(await findByText("Reviewing your check")).toBeTruthy();
      expect(mockedFetchLivenessResult.mock.calls.length).toBeGreaterThan(firstCallCount);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await findByText("Liveness check completed");
      const callsAfterCompleted = mockedFetchLivenessResult.mock.calls.length;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(9000);
      });
      expect(mockedFetchLivenessResult.mock.calls.length).toBe(callsAfterCompleted);
    } finally {
      jest.useRealTimers();
    }
  });
});

// --- Compliance semantics -----------------------------------------------------------

describe("Liveness: Compliance semantics", () => {
  it("never calls attemptComplianceStep -- the backend alone resolves the step", async () => {
    mockedFetchLivenessResult.mockResolvedValue(livenessSession({ status: "completed", verdict: "live" }));
    await renderCompliance();
    await waitFor(() => expect(mockedFetchLivenessResult).toHaveBeenCalled());
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();
  });
});

// --- Privacy / Fake separation --------------------------------------------------

describe("Liveness: privacy and Fake separation", () => {
  it("never mixes the Fake development simulator into the real capture flow", async () => {
    const { findByText, findAllByText } = await renderCompliance();
    expect(await findByText("Start check")).toBeTruthy();
    expect((await findAllByText("Development simulator")).length).toBeGreaterThanOrEqual(1);
  });
});
