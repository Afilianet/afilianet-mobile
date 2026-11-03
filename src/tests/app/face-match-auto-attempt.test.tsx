import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { ApiError } from "../../api/errors";
import { fetchFaceMatchResult, fetchLivenessResult } from "../../api/endpoints";
import { FaceMatchStep } from "../../components/compliance/steps/FaceMatchStep";
import { useFaceMatchResult } from "../../hooks/useFaceMatchResult";
import { useLivenessResult } from "../../hooks/useLivenessResult";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { ComplianceStep, FaceMatchProcessingResult, LivenessSession, Organization } from "../../types/api";

/**
 * Staging round 2026-11-02 (synthetic data only): liveness finished with a
 * `review` verdict and the API created the face-match attempt itself, with
 * the liveness frame as the probe. The app had cached a 404 for
 * face-match-result 28 s earlier (face_match was processing-only), never
 * asked again, and offered a separate selfie capture while that attempt was
 * already queued. These tests replay that order of events.
 */
jest.mock("../../api/endpoints", () => ({
  fetchFaceMatchResult: jest.fn(),
  fetchLivenessResult: jest.fn(),
  triggerFaceMatchProcessing: jest.fn(),
  requestEvidenceUpload: jest.fn(),
  completeEvidenceUpload: jest.fn(),
  attemptComplianceStep: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const mockedFetchFaceMatchResult = fetchFaceMatchResult as jest.MockedFunction<typeof fetchFaceMatchResult>;
const mockedFetchLivenessResult = fetchLivenessResult as jest.MockedFunction<typeof fetchLivenessResult>;

const ORG = { id: "org-sintetica", name: "Organización sintética", identity_verification_available: true } as Organization;
const orgValue: OrganizationContextValue = {
  status: "ready", organizations: [ORG], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};

const NOT_FOUND = new ApiError("not_found", "No query results", 404);
const AUTO_ATTEMPT = {
  id: "fm-attempt-1", status: "processing", verdict: null, failure_reason: null, attempt_number: 1,
} as unknown as FaceMatchProcessingResult;
const LIVENESS_REVIEW = {
  id: "liveness-1", session_id: "sesion-sintetica", region: "us-east-1", status: "completed", verdict: "review",
  failure_reason: null, attempt_number: 1, started_at: null, completed_at: "2026-11-02T17:16:01Z", expires_at: null, created_at: "2026-11-02T17:15:45Z",
} as LivenessSession;

const faceMatchStep = {
  id: "fm-step", step_type: "face_match", status: "pending", provider: null, score: null, attempt_count: 0, completed_at: null,
  created_at: "2026-11-02T17:14:39Z", configured_provider: "afilianet", provider_actionable: true, provider_unavailable_reason: null,
} as ComplianceStep;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <OrganizationContext.Provider value={orgValue}>{children}</OrganizationContext.Provider>
      </QueryClientProvider>
    );
  };
}

function newClient() {
  // Same 30 s staleTime as the app's queryClient: the cached 404 is still "fresh" when the step becomes current.
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

beforeEach(() => {
  jest.resetAllMocks();
});

it("a completed liveness result makes the face-match result be read again, so the automatic attempt is seen", async () => {
  mockedFetchLivenessResult.mockResolvedValue(LIVENESS_REVIEW);
  mockedFetchFaceMatchResult.mockRejectedValueOnce(NOT_FOUND).mockResolvedValue(AUTO_ATTEMPT);

  function Probe() {
    useLivenessResult("liveness-step");
    const faceMatch = useFaceMatchResult("fm-step", true);
    return <Text testID="fm-status">{faceMatch.data === undefined ? "loading" : faceMatch.data?.status ?? "none"}</Text>;
  }
  const Wrapper = wrapper(newClient());
  const view = await render(<Wrapper><Probe /></Wrapper>);

  await waitFor(() => expect(view.getByTestId("fm-status").props.children).toBe("processing"));
  expect(mockedFetchFaceMatchResult).toHaveBeenCalledTimes(2);
});

it("when face_match turns from processing-only into the current step, a cached 'no attempt' is checked again before offering a selfie", async () => {
  mockedFetchFaceMatchResult.mockRejectedValueOnce(NOT_FOUND).mockResolvedValue(AUTO_ATTEMPT);
  const Wrapper = wrapper(newClient());

  const view = await render(<Wrapper><FaceMatchStep step={faceMatchStep} attempt={jest.fn()} isPending={false} processingOnly /></Wrapper>);
  await waitFor(() => expect(mockedFetchFaceMatchResult).toHaveBeenCalledTimes(1));

  await view.rerender(<Wrapper><FaceMatchStep step={faceMatchStep} attempt={jest.fn()} isPending={false} processingOnly={false} /></Wrapper>);

  await waitFor(() => expect(view.getByText("Comparando tu selfie")).toBeTruthy());
  expect(mockedFetchFaceMatchResult).toHaveBeenCalledTimes(2);
  expect(view.queryByText("Aún no capturado")).toBeNull();
});
