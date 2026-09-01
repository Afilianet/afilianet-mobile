import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  attemptComplianceStep,
  confirmDocumentResult,
  fetchComplianceSteps,
  fetchDocumentResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  startCompliance,
  triggerDocumentProcessing,
} from "../../api/endpoints";
import { analytics } from "../../services/analytics";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, ComplianceCase, ComplianceStep, DocumentProcessingResult, Organization } from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * Phase 9C.2a: the real confirm/correct-extracted-fields flow (PATCH
 * .../document-result). Every scenario here seeds fetchDocumentResult
 * directly with an already-COMPLETED result (never re-exercises the
 * capture/upload flow itself -- see compliance-document-capture.test.tsx
 * for that coverage) so DocumentCaptureFlow jumps straight to
 * DocumentResultView/DocumentConfirmationForm.
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
  confirmDocumentResult: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;
const mockedTriggerDocumentProcessing = triggerDocumentProcessing as jest.Mock;
const mockedFetchDocumentResult = fetchDocumentResult as jest.Mock;
const mockedConfirmDocumentResult = confirmDocumentResult as jest.Mock;
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
    status: "completed",
    verdict: "pass",
    confidence: 0.95,
    extracted_fields: [],
    confirmed_fields: null,
    confirmation_required: false,
    confirmation_status: "not_required",
    failure_reason: null,
    processor_version: "afilianet-document-engine-1",
    attempt_number: 1,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const PENDING_CONFIRMATION_RESULT = documentResult({
  verdict: "pass",
  confirmation_required: true,
  confirmation_status: "pending",
  extracted_fields: [
    { name: "first_name", value: "JUAN CARLOS", confidence: 0.97, confirmation_required: true },
    { name: "curp", value: "PEGJ900515HDFRZN08", confidence: 0.79, confirmation_required: true },
  ],
});

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
  mockedFetchComplianceSteps.mockResolvedValue([step()]);
  mockedFetchDocumentResult.mockResolvedValue(PENDING_CONFIRMATION_RESULT);
  mockedTriggerDocumentProcessing.mockResolvedValue(documentResult({ status: "pending" }));
});

afterEach(() => {
  queryClient.clear();
});

describe("Document confirmation: form rendering", () => {
  it("renders an editable form, pre-filled with the extracted values, when confirmation is required", async () => {
    const { findByText, findByDisplayValue } = await renderCompliance();

    expect(await findByText("Confirm your details")).toBeTruthy();
    expect(await findByDisplayValue("JUAN CARLOS")).toBeTruthy();
    expect(await findByDisplayValue("PEGJ900515HDFRZN08")).toBeTruthy();
  });

  it("never renders the confirmation form when confirmation isn't required", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({ verdict: "pass", confirmation_required: false, confirmation_status: "not_required", extracted_fields: [] }),
    );
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Confirmed from document")).toBeTruthy();
    expect(queryByText("Confirm your details")).toBeNull();
  });

  it("never offers a confirmation form for a fail verdict, even if confirmation_required is true", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({
        status: "completed",
        verdict: "fail",
        confirmation_required: true,
        confirmation_status: "pending",
        extracted_fields: [{ name: "first_name", value: "JUAN CARLOS", confidence: 0.4, confirmation_required: true }],
      }),
    );
    const { findByText, queryByText } = await renderCompliance();

    expect(await findByText("Needs correction")).toBeTruthy();
    expect(queryByText("Confirm your details")).toBeNull();
    // Extracted fields are still shown read-only, just never editable here.
    expect(await findByText("JUAN CARLOS")).toBeTruthy();
  });

  it("shows the review state AND the confirmation form together -- confirmation is decoupled from the verdict", async () => {
    mockedFetchDocumentResult.mockResolvedValue(
      documentResult({
        verdict: "review",
        confirmation_required: true,
        confirmation_status: "pending",
        extracted_fields: [{ name: "curp", value: "PEGJ900515HDFRZN08", confidence: 0.5, confirmation_required: true }],
      }),
    );
    const { findByText } = await renderCompliance();

    expect(await findByText("Please review")).toBeTruthy();
    expect(await findByText("Confirm your details")).toBeTruthy();
  });
});

describe("Document confirmation: submission", () => {
  it("submits exactly the extracted field names/edited values, refetches, and shows confirmed_fields on success", async () => {
    mockedConfirmDocumentResult.mockResolvedValue(
      documentResult({
        verdict: "pass",
        confirmation_required: true,
        confirmation_status: "confirmed",
        extracted_fields: PENDING_CONFIRMATION_RESULT.extracted_fields,
        confirmed_fields: { first_name: "JUAN C. CORRECTED", curp: "PEGJ900515HDFRZN08" },
      }),
    );

    const { findByText, findByDisplayValue } = await renderCompliance();
    const input = await findByDisplayValue("JUAN CARLOS");
    fireEvent.changeText(input, "JUAN C. CORRECTED");
    fireEvent.press(await findByText("Confirm details"));

    await waitFor(() => {
      expect(mockedConfirmDocumentResult).toHaveBeenCalledWith("step-1", {
        first_name: "JUAN C. CORRECTED",
        curp: "PEGJ900515HDFRZN08",
      });
    });

    expect(await findByText("Your confirmed details")).toBeTruthy();
    expect(await findByText("JUAN C. CORRECTED")).toBeTruthy();
    expect(mockedCapture).toHaveBeenCalledWith("document_fields_confirmed");
    // Never anything resembling a client-side "mark this step approved" call.
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();
  });

  it("preserves the user's edits and shows a field-level error on a 422 validation failure", async () => {
    mockedConfirmDocumentResult.mockRejectedValue(
      new ApiError("validation", "The given data was invalid.", 422, { curp: ["The curp format is invalid."] }),
    );

    const { findByText, findByDisplayValue } = await renderCompliance();
    const curpInput = await findByDisplayValue("PEGJ900515HDFRZN08");
    fireEvent.changeText(curpInput, "NOT-A-CURP");
    fireEvent.press(await findByText("Confirm details"));

    expect(await findByText("The curp format is invalid.")).toBeTruthy();
    // The edit is still there -- the form was never cleared/reset.
    expect(await findByDisplayValue("NOT-A-CURP")).toBeTruthy();
  });

  it("treats a 409 changed-reconfirmation as a hard stop and refreshes to the authoritative confirmed values, never auto-retrying", async () => {
    mockedConfirmDocumentResult.mockRejectedValueOnce(
      new ApiError("conflict", "This document result has already been confirmed and cannot be changed.", 409),
    );
    const alreadyConfirmed = documentResult({
      verdict: "pass",
      confirmation_required: true,
      confirmation_status: "confirmed",
      extracted_fields: PENDING_CONFIRMATION_RESULT.extracted_fields,
      confirmed_fields: { first_name: "JUAN CARLOS", curp: "PEGJ900515HDFRZN08" },
    });

    const { findByText, queryByText, findByDisplayValue } = await renderCompliance();
    const input = await findByDisplayValue("JUAN CARLOS");
    fireEvent.changeText(input, "SOMETHING ELSE");
    // The subsequent GET (triggered by the hook's onError refetch) returns
    // the already-confirmed authoritative result.
    mockedFetchDocumentResult.mockResolvedValue(alreadyConfirmed);
    fireEvent.press(await findByText("Confirm details"));

    // A hard stop: the UI settles on the AUTHORITATIVE confirmed values,
    // never the user's rejected edit -- no silent overwrite.
    expect(await findByText("Your confirmed details")).toBeTruthy();
    expect(queryByText("SOMETHING ELSE")).toBeNull();
    expect(await findByText("JUAN CARLOS")).toBeTruthy();
    // The mutation was attempted exactly once -- no automatic retry loop.
    expect(mockedConfirmDocumentResult).toHaveBeenCalledTimes(1);
  });
});

describe("Document confirmation: security and tenant isolation", () => {
  it("never sends confirmed field values to analytics", async () => {
    mockedConfirmDocumentResult.mockResolvedValue(
      documentResult({
        verdict: "pass",
        confirmation_status: "confirmed",
        confirmed_fields: { first_name: "JUAN CARLOS", curp: "PEGJ900515HDFRZN08" },
      }),
    );
    const { findByText } = await renderCompliance();
    fireEvent.press(await findByText("Confirm details"));

    await waitFor(() => expect(mockedCapture).toHaveBeenCalled());
    for (const call of mockedCapture.mock.calls) {
      const raw = JSON.stringify(call);
      expect(raw).not.toContain("JUAN CARLOS");
      expect(raw).not.toContain("PEGJ900515HDFRZN08");
    }
  });

  it("clears any in-progress confirmation edits when the organization changes", async () => {
    const { findByDisplayValue, queryByDisplayValue, rerender } = await renderCompliance();
    const input = await findByDisplayValue("JUAN CARLOS");
    fireEvent.changeText(input, "UNSAVED EDIT");
    expect(await findByDisplayValue("UNSAVED EDIT")).toBeTruthy();

    mockedFetchDocumentResult.mockResolvedValue(documentResult({ verdict: "pass", extracted_fields: [] }));
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

    await waitFor(() => expect(queryByDisplayValue("UNSAVED EDIT")).toBeNull());
    expect(queryByDisplayValue("JUAN CARLOS")).toBeNull();
  });
});
