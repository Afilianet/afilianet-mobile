import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { TermsAcceptanceStep } from "../../components/compliance/steps/TermsAcceptanceStep";
import { AssistedComplianceContext } from "../../state/ComplianceScopeContext";
import type { ComplianceStep } from "../../types/api";

/**
 * API A5 in an assisted verification: the sponsor holds the phone, but the terms are accepted by the
 * person whose identity is verified (the server records accepted_via = assisted_enrollment). The
 * document and the acceptance are the same; the screen says who decides. FICTITIOUS document.
 */
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const step = {
  id: "terms-1", step_type: "terms_acceptance", status: "pending", provider: null, score: null, attempt_count: 0,
  completed_at: null, created_at: "2026-10-30T00:00:00Z", configured_provider: null, provider_actionable: true, provider_unavailable_reason: null,
  terms_document: { version: "prueba-terminos.1", title: "Términos de PRUEBA", sections: [{ title: "PRUEBA", text: "Texto ficticio." }], content_sha256: "d".repeat(64) },
} as ComplianceStep;

it("in an assisted verification, addresses the person verified and sends the same acceptance", async () => {
  const attempt = jest.fn();
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Aceptar")?.onPress?.());
  const view = await render(
    <AssistedComplianceContext.Provider value="enrollment-a"><TermsAcceptanceStep step={step} attempt={attempt} isPending={false} /></AssistedComplianceContext.Provider>,
  );
  expect(view.getByTestId("terms-assisted-note")).toBeTruthy();
  expect(view.getByText(/los acepta la persona cuya identidad se verifica/)).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText("Aceptar estos términos")));
  expect(attempt).toHaveBeenCalledWith({ accepted: true, document_version: "prueba-terminos.1", document_sha256: "d".repeat(64) });
});

it("in the person's own verification there is no such note", async () => {
  const view = await render(<TermsAcceptanceStep step={step} attempt={jest.fn()} isPending={false} />);
  expect(view.queryByTestId("terms-assisted-note")).toBeNull();
  expect(view.getByText("Términos de PRUEBA")).toBeTruthy();
});
