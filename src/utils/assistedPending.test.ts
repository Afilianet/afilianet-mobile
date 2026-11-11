import { assistedCreationOff, blockedExplanation, canOfferRetry } from "./assistedPending";
import type { PendingAssistedEnrollment } from "../services/assistedQueue";

jest.mock("../api/assistedEnrollment", () => ({ lookupAssistedEnrollmentByRequest: jest.fn() }));
jest.mock("../api/client", () => ({ captureApiSessionGuard: jest.fn(() => () => true) }));
jest.mock("../services/storage", () => ({ secureStorage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } }));

const base: PendingAssistedEnrollment = {
  sponsorUserId: "sponsor-a", organizationId: "org-a",
  input: { first_name: "Ana", last_name: "López", email: "ana@example.com", client_request_id: "request-a", consent_confirmed: true },
};

describe("assistedCreationOff", () => {
  it("a draft that never left the phone is off only when the setting is explicitly off", () => {
    expect(assistedCreationOff(base, false)).toBe(true);
    expect(assistedCreationOff(base, true)).toBe(false);
  });
  it("a server refusal is off whatever the local setting says", () => {
    const blocked = { ...base, createAttempted: true, blocked: { reason: "assisted_enrollment_unavailable" as const, at: "2026-11-11T00:00:00Z" } };
    expect(assistedCreationOff(blocked, true)).toBe(true);
  });
  it("never for an enrollment that exists or may exist, nor for a KYC block", () => {
    expect(assistedCreationOff({ ...base, enrollmentId: "enrollment-a" }, false)).toBe(false);
    expect(assistedCreationOff({ ...base, createAttempted: true }, false)).toBe(false);
    expect(assistedCreationOff({ ...base, enrollmentId: "enrollment-a", blocked: { reason: "kyc_unavailable", at: "x" } }, false)).toBe(false);
  });
});

describe("canOfferRetry", () => {
  it("no retry for the assisted refusal while the setting is off; offered again once it is not", () => {
    expect(canOfferRetry("assisted_enrollment_unavailable", false)).toBe(false);
    expect(canOfferRetry("assisted_enrollment_unavailable", true)).toBe(true);
    expect(canOfferRetry("kyc_unavailable", false)).toBe(true);
    expect(canOfferRetry("assisted_access_claimed", true)).toBe(false);
  });
});

it("explains why the draft cannot be sent and that nothing is deleted on its own", () => {
  const copy = blockedExplanation("assisted_enrollment_unavailable");
  expect(copy.description).toMatch(/este registro no puede enviarse/);
  expect(copy.description).toMatch(/lo guardado sigue cifrado en este teléfono/);
});
