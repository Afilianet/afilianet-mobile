import { render } from "@testing-library/react-native";
import { TermsAcceptanceStep } from "../../components/compliance/steps/TermsAcceptanceStep";
import { AssistedComplianceContext, AssistedPersonNameContext } from "../../state/ComplianceScopeContext";
import type { ComplianceStep } from "../../types/api";

/**
 * API #106: only the person verified accepts the KYC terms, from their own session. In a sponsor's
 * assisted verification the step says who still has to accept, with or without a published
 * document, and never offers the button. Once accepted, the text keeps the actor and the person
 * apart (`accepted_via`). FICTITIOUS document and person.
 */
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const DOCUMENT = { version: "prueba-terminos.1", title: "Términos de PRUEBA", sections: [{ title: "PRUEBA", text: "Texto ficticio." }], content_sha256: "d".repeat(64) };
const step = (overrides: Partial<ComplianceStep> = {}) =>
  ({
    id: "terms-1", step_type: "terms_acceptance", status: "pending", provider: null, score: null, attempt_count: 0,
    completed_at: null, created_at: "2026-10-30T00:00:00Z", configured_provider: null, provider_actionable: true, provider_unavailable_reason: null,
    terms_document: DOCUMENT, requires_own_session: false, accepted_via: null, ...overrides,
  }) as ComplianceStep;

/** `null`: the enrollment record has no name to show. */
function renderAssisted(s: ComplianceStep, name: string | null = "Persona Ficticia") {
  return render(
    <AssistedComplianceContext.Provider value="enrollment-a">
      <AssistedPersonNameContext.Provider value={name ?? undefined}>
        <TermsAcceptanceStep step={s} attempt={jest.fn()} isPending={false} />
      </AssistedPersonNameContext.Provider>
    </AssistedComplianceContext.Provider>,
  );
}

describe("sponsor in an assisted verification: pending, never an accept button", () => {
  it.each([
    ["with a published document", DOCUMENT],
    ["with no document published (null)", null],
  ])("%s, the step names who has to accept and shows neither button nor document", async (_label, document) => {
    const view = await renderAssisted(step({ terms_document: document, requires_own_session: true }));
    expect(view.getByTestId("terms-requires-own-session")).toBeTruthy();
    expect(view.getByText(/Falta que Persona Ficticia acepte los términos desde su propia cuenta/)).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(view.queryByText("Términos de PRUEBA")).toBeNull();
    expect(view.queryByTestId("terms-not-published")).toBeNull();
  });

  it("also on an API that does not send requires_own_session yet: the sponsor is refused server-side anyway", async () => {
    const view = await renderAssisted(step({ requires_own_session: undefined }));
    expect(view.getByTestId("terms-requires-own-session")).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });

  it("without the person's name it says «esta persona»", async () => {
    const view = await renderAssisted(step({ requires_own_session: true }), null);
    expect(view.getByText(/Falta que esta persona acepte/)).toBeTruthy();
  });
});

describe("the person's own session", () => {
  it("shows the document and the button (requires_own_session false)", async () => {
    const view = await render(<TermsAcceptanceStep step={step()} attempt={jest.fn()} isPending={false} />);
    expect(view.getByText("Términos de PRUEBA")).toBeTruthy();
    expect(view.getByText("Aceptar estos términos")).toBeTruthy();
    expect(view.queryByTestId("terms-requires-own-session")).toBeNull();
  });
});

describe("accepted: the actor is kept apart from the person verified (accepted_via)", () => {
  it.each([
    ["own session, own_session", false, "own_session", "Aceptaste los términos de esta verificación."],
    ["own session, earlier record from a sponsor", false, "assisted_enrollment", "Los términos se aceptaron durante el registro asistido, desde la sesión de quien registró a la persona."],
    ["sponsor, person accepted from their account", true, "own_session", "La persona aceptó los términos desde su propia cuenta."],
    ["sponsor, earlier record from a sponsor", true, "assisted_enrollment", "Los términos se aceptaron durante el registro asistido, desde la sesión de quien registró a la persona."],
  ] as const)("%s", async (_label, assisted, acceptedVia, text) => {
    const passed = step({ status: "passed", accepted_via: acceptedVia, requires_own_session: assisted });
    const view = assisted ? await renderAssisted(passed) : await render(<TermsAcceptanceStep step={passed} attempt={jest.fn()} isPending={false} />);
    expect(view.getByTestId("terms-accepted").props.children).toBe(text);
  });
});
