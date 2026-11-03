import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ApiError } from "../../api/errors";
import { attemptComplianceStep, fetchComplianceSteps, fetchMyAffiliateProfile, fetchMyCompliance } from "../../api/endpoints";
import ComplianceScreen from "../../app/compliance";
import { TermsAcceptanceStep } from "../../components/compliance/steps/TermsAcceptanceStep";
import { AssistedComplianceContext, AssistedPersonNameContext } from "../../state/ComplianceScopeContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, ComplianceCase, ComplianceStep, Organization } from "../../types/api";

/**
 * API #109: a terms step already passed or skipped without the person's own
 * acceptance (a sponsor's record, one without a version, a skipped step)
 * comes with `needs_own_acceptance: true`. The person accepts again from
 * their own session with the same attempt; the step stays passed and the case
 * status does not change (often manual_review). The sponsor never gets the
 * button. FICTITIOUS document, person and case.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../api/endpoints", () => ({
  fetchMyAffiliateProfile: jest.fn(),
  fetchMyCompliance: jest.fn(),
  startCompliance: jest.fn(),
  fetchComplianceSteps: jest.fn(),
  attemptComplianceStep: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

const mockedFetchMyAffiliateProfile = fetchMyAffiliateProfile as jest.Mock;
const mockedFetchMyCompliance = fetchMyCompliance as jest.Mock;
const mockedFetchComplianceSteps = fetchComplianceSteps as jest.Mock;
const mockedAttemptComplianceStep = attemptComplianceStep as jest.Mock;

const DOCUMENT = { version: "prueba-terminos.2", title: "Términos de PRUEBA", sections: [{ title: "PRUEBA", text: "Texto ficticio." }], content_sha256: "e".repeat(64) };
const ORG = { id: "org-sintetica", name: "Organización sintética", my_role: "affiliate", my_membership_status: "active" } as Organization;
const AFFILIATE = { id: "aff-1", affiliate_code: "AFF1", status: "pending", joined_at: null, activated_at: null, metadata: null, created_at: "2026-11-01T00:00:00Z" } as unknown as AffiliateProfile;

const termsStep = (overrides: Partial<ComplianceStep> = {}) =>
  ({
    id: "terms-1", step_type: "terms_acceptance", status: "passed", provider: null, score: null, attempt_count: 1,
    completed_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", configured_provider: null, provider_actionable: true,
    provider_unavailable_reason: null, terms_document: DOCUMENT, requires_own_session: false, accepted_via: "assisted_enrollment",
    needs_own_acceptance: true, ...overrides,
  }) as ComplianceStep;

const reviewCase = (step: ComplianceStep) =>
  ({
    id: "case-1", status: "manual_review", current_step: null, risk_level: null, started_at: "2026-11-01T00:00:00Z", submitted_at: null,
    reviewed_at: null, approved_at: null, rejected_at: null, expires_at: null, rejection_reason: null, created_at: "2026-11-01T00:00:00Z",
    steps: [step],
  }) as unknown as ComplianceCase;

let queryClient: QueryClient;

function orgValue(organization: Organization = ORG): OrganizationContextValue {
  return { status: "ready", organizations: [organization], activeOrganization: organization, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
}

async function renderScreen(organization?: Organization) {
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue(organization)}>
          <ComplianceScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return view;
}

function autoConfirm() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === "Aceptar")?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchMyAffiliateProfile.mockResolvedValue(AFFILIATE);
  mockedFetchComplianceSteps.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
  queryClient.clear();
});

describe("own session, needs_own_acceptance true", () => {
  it.each([
    ["a passed step accepted from a sponsor's session", { status: "passed", accepted_via: "assisted_enrollment" }],
    ["a passed step accepted without a version", { status: "passed", accepted_via: null }],
    ["a skipped step", { status: "skipped", accepted_via: null, completed_at: null }],
  ] as const)("%s in a case under manual review: shows the document and the button, and sends that version and hash", async (_label, overrides) => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep(overrides)));
    mockedAttemptComplianceStep.mockResolvedValue(reviewCase(termsStep({ accepted_via: "own_session", needs_own_acceptance: false })));
    const view = await renderScreen();

    expect(await view.findByTestId("terms-needs-own-acceptance")).toBeTruthy();
    expect(view.getByText("Términos de PRUEBA")).toBeTruthy();
    expect(view.getByText("Versión prueba-terminos.2")).toBeTruthy();
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });
    expect(mockedAttemptComplianceStep).toHaveBeenCalledTimes(1);
    expect(mockedAttemptComplianceStep.mock.calls[0][0]).toBe("terms-1");
    expect(mockedAttemptComplianceStep.mock.calls[0][1]).toEqual({ accepted: true, document_version: "prueba-terminos.2", document_sha256: "e".repeat(64) });
    // Own session: no assisted scope header argument.
    expect(mockedAttemptComplianceStep.mock.calls[0][2]).toBeUndefined();
  });

  it("after accepting, says it was recorded and that the case still waits for the organization's review; promises no approval", async () => {
    let accepted = false;
    mockedFetchMyCompliance.mockImplementation(async () =>
      reviewCase(accepted ? termsStep({ accepted_via: "own_session", needs_own_acceptance: false }) : termsStep()));
    mockedAttemptComplianceStep.mockImplementation(async () => {
      accepted = true;
      return reviewCase(termsStep({ accepted_via: "own_session", needs_own_acceptance: false }));
    });
    const view = await renderScreen();
    await view.findByTestId("terms-needs-own-acceptance");
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });

    const recorded = await view.findByTestId("terms-own-acceptance-recorded");
    expect(recorded.props.children).toBe("Registramos tu aceptación desde tu cuenta. Tu verificación sigue pendiente de la revisión de la organización.");
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(view.queryByText(/aprobad/i)).toBeNull();
    expect(view.getByText("Revisión manual")).toBeTruthy();
  });

  it("with no document published: says so and offers no button", async () => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep({ terms_document: null })));
    const view = await renderScreen();
    expect(await view.findByTestId("terms-not-published")).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });

  it("with KYC capture off: says acceptance is not available now and offers no button", async () => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep()));
    const view = await renderScreen({ ...ORG, identity_verification_available: false } as Organization);
    expect(await view.findByTestId("terms-needs-own-unavailable")).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(mockedAttemptComplianceStep).not.toHaveBeenCalled();
  });

  it.each([
    ["409 terms_require_own_session", new ApiError("conflict", "x", 409, undefined, { reason: "terms_require_own_session" }),
      "Esta persona debe aceptar los términos desde su propia cuenta. No se registró ninguna aceptación."],
    ["409 terms_not_published", new ApiError("conflict", "x", 409, undefined, { reason: "terms_not_published" }),
      "Los términos de esta verificación ya no están publicados. No se registró ninguna aceptación."],
    ["409 terms_document_changed", new ApiError("conflict", "x", 409, undefined, { reason: "terms_document_changed" }),
      "Los términos cambiaron. Revisa la versión nueva antes de aceptar; no se registró ninguna aceptación."],
    ["503 kyc_unavailable", new ApiError("server", "x", 503, undefined, { reason: "kyc_unavailable" }),
      "Verificación de identidad no disponible en esta organización."],
  ])("%s: says nothing was recorded (the 409s also reload the case)", async (_label, error, message) => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep()));
    mockedAttemptComplianceStep.mockRejectedValue(error);
    const view = await renderScreen();
    await view.findByTestId("terms-needs-own-acceptance");
    const caseReadsBefore = mockedFetchMyCompliance.mock.calls.length;
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });
    expect(await view.findByText(message)).toBeTruthy();
    if (error.reason !== "kyc_unavailable") {
      await waitFor(() => expect(mockedFetchMyCompliance.mock.calls.length).toBeGreaterThan(caseReadsBefore));
    }
  });

  it("422 (case closed, or the acceptance is already own): shows an error and reloads the case", async () => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep()));
    mockedAttemptComplianceStep.mockRejectedValue(new ApiError("validation", "The step is not actionable.", 422));
    const view = await renderScreen();
    await view.findByTestId("terms-needs-own-acceptance");
    const caseReadsBefore = mockedFetchMyCompliance.mock.calls.length;
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });
    await waitFor(() => expect(mockedFetchMyCompliance.mock.calls.length).toBeGreaterThan(caseReadsBefore));
    expect(mockedAttemptComplianceStep).toHaveBeenCalledTimes(1);
  });
});

describe("needs_own_acceptance false or absent: unchanged", () => {
  it.each([
    ["false", false],
    ["absent (API before #109)", undefined],
  ])("%s on a passed own acceptance: the accepted text, no button", async (_label, flag) => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep({ accepted_via: "own_session", needs_own_acceptance: flag })));
    const view = await renderScreen();
    expect((await view.findByTestId("terms-accepted")).props.children).toBe("Aceptaste los términos de esta verificación.");
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(view.queryByTestId("terms-needs-own-acceptance")).toBeNull();
  });

  it("absent on a passed sponsor record: keeps naming the sponsor's session, no button", async () => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep({ needs_own_acceptance: undefined })));
    const view = await renderScreen();
    expect((await view.findByTestId("terms-accepted")).props.children).toMatch(/desde la sesión de quien registró a la persona/);
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });

  it.each([
    ["false", false],
    ["absent", undefined],
  ])("%s on a skipped step: says it was skipped, no button (the API refuses an attempt on it)", async (_label, flag) => {
    mockedFetchMyCompliance.mockResolvedValue(reviewCase(termsStep({ status: "skipped", accepted_via: null, needs_own_acceptance: flag })));
    const view = await renderScreen();
    expect(await view.findByTestId("terms-skipped")).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });
});

describe("sponsor in an assisted verification: never the button", () => {
  it.each([
    ["passed from the sponsor's session", { status: "passed", accepted_via: "assisted_enrollment" }],
    ["passed without a version", { status: "passed", accepted_via: null }],
    ["skipped", { status: "skipped", accepted_via: null }],
    ["passed, no document published", { status: "passed", terms_document: null }],
  ] as const)("needs_own_acceptance true, %s: names who still has to accept", async (_label, overrides) => {
    const view = await render(
      <AssistedComplianceContext.Provider value="enrollment-a">
        <AssistedPersonNameContext.Provider value="Persona Ficticia">
          <TermsAcceptanceStep step={termsStep({ requires_own_session: true, ...overrides })} attempt={jest.fn()} isPending={false} />
        </AssistedPersonNameContext.Provider>
      </AssistedComplianceContext.Provider>,
    );
    expect(view.getByText(/Falta que Persona Ficticia acepte los términos desde su propia cuenta/)).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(view.queryByText("Términos de PRUEBA")).toBeNull();
  });

  it("once the person accepted (needs_own_acceptance false, own_session): says the person accepted, no button", async () => {
    const view = await render(
      <AssistedComplianceContext.Provider value="enrollment-a">
        <TermsAcceptanceStep step={termsStep({ requires_own_session: true, accepted_via: "own_session", needs_own_acceptance: false })} attempt={jest.fn()} isPending={false} />
      </AssistedComplianceContext.Provider>,
    );
    expect(view.getByTestId("terms-accepted").props.children).toBe("La persona aceptó los términos desde su propia cuenta.");
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });
});
