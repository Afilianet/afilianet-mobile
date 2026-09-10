import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ApiError } from "../../api/errors";
import {
  attemptComplianceStep,
  fetchComplianceSteps,
  fetchDocumentResult,
  fetchMyAffiliateProfile,
  fetchMyCompliance,
  startCompliance,
} from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { AffiliateProfile, ComplianceCase, ComplianceStep, Organization } from "../../types/api";
import ComplianceScreen from "../../app/compliance";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
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

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedStartCompliance = startCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;
const mockedFetchDocumentResult = fetchDocumentResult as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

/** Auto-confirms the "¿Aceptar términos?" Alert by invoking its "Aceptar" button. */
function autoConfirmTermsAlert() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    const acceptButton = buttons?.find((button) => button.text === "Aceptar");
    acceptButton?.onPress?.();
  });
}

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
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchMyCompliance.mockResolvedValue(complianceCase());
  mockedFetchComplianceSteps.mockResolvedValue([step()]);
  // No document-processing attempt exists yet by default -- identity_document
  // steps in this file exercise the dispatch/status mechanism, not the real
  // capture flow's depth (see compliance-document-capture.test.tsx for that).
  mockedFetchDocumentResult.mockRejectedValue(NOT_FOUND);
});

afterEach(() => {
  queryClient.clear();
});

describe("Compliance: case statuses", () => {
  it("shows not_started with a Start verification CTA when no case exists yet", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    const { findByText } = await renderCompliance();
    expect(await findByText("No iniciado")).toBeTruthy();
    expect(await findByText("Comenzar verificación")).toBeTruthy();
  });

  it("shows in_progress", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();
    expect(await findByText("En progreso")).toBeTruthy();
  });

  it("shows pending_review", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "pending_review", current_step: null }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Revisión pendiente")).toBeTruthy();
  });

  it("shows manual_review", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "manual_review", current_step: null }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Revisión manual")).toBeTruthy();
  });

  it("shows approved with the approval date and no next-step line", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "approved", current_step: null, approved_at: "2026-01-05T00:00:00Z" }),
    );
    const { findAllByText, queryByText } = await renderCompliance();
    // Appears twice by design: the status badge, and the "Aprobado el <date>" line below it.
    expect((await findAllByText(/Aprobado/)).length).toBe(2);
    expect(queryByText(/^Siguiente:/)).toBeNull();
  });

  it("shows rejected with the rejection reason", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "rejected", current_step: null, rejection_reason: "Document was blurry" }),
    );
    const { findByText } = await renderCompliance();
    expect(await findByText("Rechazado")).toBeTruthy();
    expect(await findByText("Document was blurry")).toBeTruthy();
  });

  it("shows expired with the expiration date", async () => {
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "expired", current_step: null, expires_at: "2026-01-10T00:00:00Z" }),
    );
    const { findAllByText } = await renderCompliance();
    // Appears twice by design: the status badge ("Vencido") and the
    // "Venció el <date>" line below it -- both start with a capital V. The
    // status description ("Tu verificación venció.") also contains the stem
    // but lowercase mid-sentence, so this stays case-sensitive (no /i) to
    // exclude it, matching the original English test's intent.
    expect((await findAllByText(/Venc/)).length).toBe(2);
  });

  it("shows the next required step for a non-terminal case", async () => {
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress", current_step: "terms_acceptance" }));
    const { findByText } = await renderCompliance();
    expect(await findByText("Siguiente: Aceptación de términos")).toBeTruthy();
  });
});

describe("Compliance: required steps", () => {
  it("renders only the steps the organization actually configured -- not all six types", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "s1", step_type: "identity_document" }),
      step({ id: "s2", step_type: "terms_acceptance" }),
    ]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Documento de identidad")).toBeTruthy();
    expect(await findByText("Aceptación de términos")).toBeTruthy();
    expect(queryByText("Prueba de vida")).toBeNull();
    expect(queryByText("Coincidencia facial")).toBeNull();
    expect(queryByText("Consentimiento verbal")).toBeNull();
    expect(queryByText("Información de identidad")).toBeNull();
  });

  it("renders a single-step org configuration just as accurately as a multi-step one", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "s1", step_type: "identity_document" })]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Documento de identidad")).toBeTruthy();
    expect(queryByText("Aceptación de términos")).toBeNull();
  });

  it("shows the real Afilianet document-capture flow for a pending identity_document step", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "pending" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("¿Qué documento vas a proporcionar?")).toBeTruthy();
  });

  it("shows a passed step as completed, with its completion date", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "passed", completed_at: "2026-01-03T00:00:00Z" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Aprobado")).toBeTruthy();
    expect(await findByText(/verificado/i)).toBeTruthy();
    expect(await findByText(/Completado/)).toBeTruthy();
  });

  it("shows a failed identity_document step with a real way to try again, not a non-functional retry action", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ status: "failed", attempt_count: 1 })]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Rechazado")).toBeTruthy();
    // No prior document-processing result exists in this file's default mocks,
    // so document_type can't be recovered -- the real capture flow asks again.
    expect(await findByText("¿Qué documento vas a proporcionar?")).toBeTruthy();
    expect(queryByText("Intenta de nuevo")).toBeNull();
  });

  it("never renders raw provider or score values", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ status: "passed", provider: "fake-identity", score: 0.95, completed_at: "2026-01-03T00:00:00Z" }),
    ]);
    const { queryByText } = await renderCompliance();
    await waitFor(() => expect(mockedFetchComplianceSteps).toHaveBeenCalled());
    expect(queryByText(/fake-identity/i)).toBeNull();
    expect(queryByText(/0\.95/)).toBeNull();
  });

  it("does not crash the whole screen when only the steps request fails", async () => {
    // A non-retryable kind so the query settles into isError immediately,
    // instead of the test having to wait through real retry backoff delays.
    mockedFetchComplianceSteps.mockRejectedValue(new ApiError("forbidden", "Forbidden.", 403));
    const { findByText } = await renderCompliance();
    expect(await findByText("En progreso")).toBeTruthy(); // case card still rendered
    expect(await findByText(/No pudimos cargar tus pasos requeridos/i)).toBeTruthy();
  });
});

describe("Compliance: starting a case", () => {
  it("starts a case and shows the resulting state", async () => {
    mockedFetchMyCompliance.mockRejectedValueOnce(NOT_FOUND);
    mockedStartCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    const startButton = await findByText("Comenzar verificación");
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "in_progress" }));
    await act(async () => {
      fireEvent.press(startButton);
    });

    expect(mockedStartCompliance).toHaveBeenCalledTimes(1);
    expect(await findByText("En progreso")).toBeTruthy();
  });

  it("shows a clear error and lets the affiliate try again if starting fails", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    mockedStartCompliance.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderCompliance();

    const startButton = await findByText("Comenzar verificación");
    await act(async () => {
      fireEvent.press(startButton);
    });

    expect(await findByText(/algo salió mal de nuestro lado/i)).toBeTruthy();
  });

  it("distinguishes an offline start failure from a generic server failure", async () => {
    mockedFetchMyCompliance.mockRejectedValue(NOT_FOUND);
    mockedStartCompliance.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
    const { findByText } = await renderCompliance();

    const startButton = await findByText("Comenzar verificación");
    await act(async () => {
      fireEvent.press(startButton);
    });

    expect(await findByText(/no tienes conexión/i)).toBeTruthy();
  });
});

describe("Compliance: errors and empty states", () => {
  it("shows an enrollment message instead of compliance content with no affiliate profile", async () => {
    mockedFetchMyAffiliateProfile.mockRejectedValue(NOT_FOUND);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Únete al programa de afiliados")).toBeTruthy();
    expect(queryByText("En progreso")).toBeNull();
  });

  it("shows a retryable error state on a 403", async () => {
    mockedFetchMyCompliance.mockRejectedValue(new ApiError("forbidden", "Forbidden.", 403));
    const { findByText } = await renderCompliance();
    expect(await findByText(/no tienes permiso/i)).toBeTruthy();
  });
});

describe("Compliance: pull-to-refresh", () => {
  it("refetches affiliate profile, case, and steps together -- how an approval becomes visible", async () => {
    const { findByText, getByTestId } = await renderCompliance();
    await findByText("En progreso");
    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(1);
    expect(mockedFetchMyCompliance).toHaveBeenCalledTimes(1);
    expect(mockedFetchComplianceSteps).toHaveBeenCalledTimes(1);

    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "approved", current_step: null }));
    mockedFetchMyAffiliateProfile.mockResolvedValue({ ...AFFILIATE, status: "active", activated_at: "2026-01-06T00:00:00Z" });

    const scrollView = getByTestId("compliance-scroll");
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockedFetchMyAffiliateProfile).toHaveBeenCalledTimes(2);
    expect(mockedFetchMyCompliance).toHaveBeenCalledTimes(2);
    expect(mockedFetchComplianceSteps).toHaveBeenCalledTimes(2);
    expect(await findByText("Aprobado")).toBeTruthy();
  });
});

describe("Compliance: organization switching", () => {
  it("never shows Org A's compliance data after switching to Org B", async () => {
    mockedFetchMyCompliance.mockImplementation(() =>
      Promise.resolve(complianceCase({ status: "in_progress", rejection_reason: null })),
    );
    const { findByText, queryByText, rerender } = await renderCompliance(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText("En progreso")).toBeTruthy();

    mockedFetchMyCompliance.mockImplementation(() => Promise.resolve(complianceCase({ status: "approved", current_step: null })));
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <ComplianceScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("Aprobado")).toBeTruthy();
    expect(queryByText("En progreso")).toBeNull();
  });
});

describe("Compliance: analytics", () => {
  it("fires compliance_viewed with no properties", async () => {
    await renderCompliance();
    const call = mockedCapture.mock.calls.find(([event]) => event === "compliance_viewed");
    expect(call).toHaveLength(1);
  });
});

describe("Compliance: terms acceptance", () => {
  it("requires confirmation, then calls the real attempt endpoint with { accepted: true }", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Aceptar términos"));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "¿Aceptar términos?",
      expect.stringMatching(/revisar los términos completos/i),
      expect.any(Array),
    );
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("discloses that no real terms document exists, without inventing legal text", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText(/no se ha publicado un documento de términos/i)).toBeTruthy();
  });

  it("submits accepted:true and refreshes compliance, steps, and affiliate profile", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    mockedAttemptComplianceStep.mockResolvedValue(
      complianceCase({ status: "approved", current_step: null, approved_at: "2026-01-06T00:00:00Z" }),
    );
    const alertSpy = autoConfirmTermsAlert();
    const { findByText } = await renderCompliance();
    await findByText("Aceptar términos");

    const profileCallsBefore = mockedFetchMyAffiliateProfile.mock.calls.length;
    const caseCallsBefore = mockedFetchMyCompliance.mock.calls.length;
    const stepsCallsBefore = mockedFetchComplianceSteps.mock.calls.length;

    await act(async () => {
      fireEvent.press(await findByText("Aceptar términos"));
    });

    expect(mockedAttemptComplianceStep.mock.calls[0][0]).toBe("terms-1");
    expect(mockedAttemptComplianceStep.mock.calls[0][1]).toEqual({ accepted: true });
    await waitFor(() => expect(mockedFetchMyCompliance.mock.calls.length).toBeGreaterThan(caseCallsBefore));
    await waitFor(() => expect(mockedFetchComplianceSteps.mock.calls.length).toBeGreaterThan(stepsCallsBefore));
    await waitFor(() => expect(mockedFetchMyAffiliateProfile.mock.calls.length).toBeGreaterThan(profileCallsBefore));

    alertSpy.mockRestore();
  });
});

describe("Compliance: identity information stays read-only", () => {
  it("shows no accept/pass/fail action for identity_information", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "info-1", step_type: "identity_information" })]);
    const { findByText, queryByText } = await renderCompliance();
    expect(await findByText("Información de identidad")).toBeTruthy();
    expect(queryByText("Aceptar términos")).toBeNull();
    expect(queryByText("Pass")).toBeNull();
    expect(queryByText("Fail")).toBeNull();
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();
  });
});

describe("Compliance: development simulator (Fake provider steps only)", () => {
  it("submits a Fake pass attempt with outcome and a deterministic score", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(mockedAttemptComplianceStep.mock.calls[0][0]).toBe("doc-1");
    expect(mockedAttemptComplianceStep.mock.calls[0][1]).toEqual({ outcome: "pass", score: 0.95 });
  });

  it("submits a Fake fail attempt", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Fail"));
    });

    expect(mockedAttemptComplianceStep.mock.calls[0][0]).toBe("doc-1");
    expect(mockedAttemptComplianceStep.mock.calls[0][1]).toEqual({ outcome: "fail", score: 0.1 });
  });

  it("hides the simulator once the step is already passed -- no pointless retry control", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "doc-1", step_type: "identity_document", status: "passed", completed_at: "2026-01-03T00:00:00Z" }),
    ]);
    const { findByText, queryByText } = await renderCompliance();
    await findByText("Aprobado");
    expect(queryByText("Pass")).toBeNull();
    expect(queryByText("Fail")).toBeNull();
  });

  it("labels the simulator clearly as development-only and not production functionality", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    const { findByText } = await renderCompliance();
    expect(await findByText("Development simulator")).toBeTruthy();
    expect(await findByText(/not available in production/i)).toBeTruthy();
  });
});

describe("Compliance: retry to manual_review", () => {
  it("reflects manual_review from the backend after a retried attempt -- never shown as approved", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "doc-1", step_type: "identity_document", status: "failed", attempt_count: 1 }),
    ]);
    mockedFetchMyCompliance.mockResolvedValueOnce(complianceCase({ status: "in_progress" }));
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "manual_review", current_step: null }));
    const { findByText, queryByText } = await renderCompliance();
    await findByText("En progreso");

    // The screen's displayed status comes from the next GET /compliance
    // call (triggered by the mutation's invalidation), not from the
    // attempt response itself -- update the mock to what the backend would
    // now return before firing the retry.
    mockedFetchMyCompliance.mockResolvedValue(complianceCase({ status: "manual_review", current_step: null }));

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(await findByText("Revisión manual")).toBeTruthy();
    expect(queryByText("Aprobado")).toBeNull();
  });
});

describe("Compliance: approval refreshes affiliate profile", () => {
  it("refetches the affiliate profile after backend returns approved", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    mockedAttemptComplianceStep.mockResolvedValue(
      complianceCase({ status: "approved", current_step: null, approved_at: "2026-01-06T00:00:00Z" }),
    );
    const alertSpy = autoConfirmTermsAlert();
    const { findByText } = await renderCompliance();
    await findByText("Aceptar términos");
    const profileCallsBefore = mockedFetchMyAffiliateProfile.mock.calls.length;

    // The screen's displayed status comes from the next GET /compliance
    // call (triggered by the mutation's invalidation), not from the
    // attempt response itself.
    mockedFetchMyCompliance.mockResolvedValue(
      complianceCase({ status: "approved", current_step: null, approved_at: "2026-01-06T00:00:00Z" }),
    );

    await act(async () => {
      fireEvent.press(await findByText("Aceptar términos"));
    });

    await waitFor(() => expect(mockedFetchMyAffiliateProfile.mock.calls.length).toBeGreaterThan(profileCallsBefore));
    expect(await findByText("Aprobado")).toBeTruthy();

    alertSpy.mockRestore();
  });
});

describe("Compliance: step attempt error handling", () => {
  it("shows a clear message and refreshes stale state on a 404 (foreign/stale step)", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
    const { findByText } = await renderCompliance();
    const caseCallsBefore = mockedFetchMyCompliance.mock.calls.length;

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(await findByText(/no pudimos encontrar eso/i)).toBeTruthy();
    await waitFor(() => expect(mockedFetchMyCompliance.mock.calls.length).toBeGreaterThan(caseCallsBefore));
  });

  it("shows a clear message and refreshes stale state on a 422 (invalid state)", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockRejectedValue(new ApiError("validation", "This step was already resolved.", 422));
    const { findByText } = await renderCompliance();
    const stepsCallsBefore = mockedFetchComplianceSteps.mock.calls.length;

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(await findByText(/already resolved/i)).toBeTruthy();
    await waitFor(() => expect(mockedFetchComplianceSteps.mock.calls.length).toBeGreaterThan(stepsCallsBefore));
  });

  it("shows a clear message on a 429 rate limit", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockRejectedValue(new ApiError("rate_limited", "Too Many Requests.", 429));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(await findByText(/demasiados intentos/i)).toBeTruthy();
  });

  it("shows a clear message when offline", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    expect(await findByText(/no tienes conexión/i)).toBeTruthy();
  });
});

describe("Compliance: step attempt analytics and privacy", () => {
  it("fires compliance_step_opened and compliance_step_submitted with no properties for terms acceptance", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "terms-1", step_type: "terms_acceptance" })]);
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const alertSpy = autoConfirmTermsAlert();
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Aceptar términos"));
    });

    const openedCall = mockedCapture.mock.calls.find(([event]) => event === "compliance_step_opened");
    const submittedCall = mockedCapture.mock.calls.find(([event]) => event === "compliance_step_submitted");
    expect(openedCall).toHaveLength(1);
    expect(submittedCall).toHaveLength(1);

    alertSpy.mockRestore();
  });

  it("fires compliance_step_submitted with no properties for a Fake dev attempt, never distinguishing pass/fail", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([step({ id: "doc-1", step_type: "identity_document", status: "pending" })]);
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ status: "in_progress" }));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Fail"));
    });

    const submittedCall = mockedCapture.mock.calls.find(([event]) => event === "compliance_step_submitted");
    expect(submittedCall).toHaveLength(1); // event name only -- no outcome/score/pass-fail distinction
  });

  it("never sends step id, case id, outcome, score, or provider data through analytics", async () => {
    mockedFetchComplianceSteps.mockResolvedValue([
      step({ id: "doc-secret-id", step_type: "identity_document", status: "pending" }),
    ]);
    mockedAttemptComplianceStep.mockResolvedValue(complianceCase({ id: "case-secret-id", status: "in_progress" }));
    const { findByText } = await renderCompliance();

    await act(async () => {
      fireEvent.press(await findByText("Pass"));
    });

    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1); // event name only, every call, no properties argument at all
    }
  });
});
