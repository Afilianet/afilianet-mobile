import type { ComplianceStep } from "../../types/api";
import { recaptureRequest } from "./recaptureRequest";

function step(overrides: Partial<ComplianceStep>): ComplianceStep {
  return {
    id: "step-1",
    step_type: "biometric_liveness",
    status: "pending",
    provider: null,
    score: null,
    attempt_count: 1,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    configured_provider: "aws_rekognition",
    provider_actionable: true,
    provider_unavailable_reason: null,
    ...overrides,
  };
}

describe("recaptureRequest", () => {
  it("asks for a new liveness check when staff reopened an attempted liveness step", () => {
    expect(recaptureRequest("biometric_liveness", [step({})])).toEqual({ action: "liveness" });
  });

  it("is null for a first attempt, a passed step, or while another step is current", () => {
    expect(recaptureRequest("biometric_liveness", [step({ attempt_count: 0 })])).toBeNull();
    expect(recaptureRequest("biometric_liveness", [step({ status: "passed" })])).toBeNull();
    expect(recaptureRequest("face_match", [step({})])).toBeNull();
    expect(recaptureRequest(null, [step({})])).toBeNull();
  });

  it("never turns a reopened face_match step into a selfie request -- only liveness is recaptured", () => {
    expect(recaptureRequest("face_match", [step({ step_type: "face_match" })])).toBeNull();
  });
});
