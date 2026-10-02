import { ApiError } from "../api/errors";
import { createAssistedEnrollment } from "../api/assistedEnrollment";
import { captureApiSessionGuard } from "../api/client";
import { completeEvidenceUpload, fetchComplianceSteps, fetchMyCompliance, requestEvidenceUpload, submitComplianceGeolocation, triggerDocumentProcessing } from "../api/endpoints";
import { fetch as expoFetch } from "expo/fetch";
import { listPendingAssisted, savePendingAssisted, syncPendingAssisted, replaceAssistedPhoto, replaceAssistedGeolocation } from "./assistedQueue";
import { removeAssistedPhoto } from "./assistedEvidenceVault";

const mockStore = new Map<string, string>();
jest.mock("./storage", () => ({
  secureStorage: {
    get: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
    remove: jest.fn(async (key: string) => { mockStore.delete(key); }),
  },
}));
jest.mock("../api/client", () => ({ captureApiSessionGuard: jest.fn(() => () => true) }));
jest.mock("../api/assistedEnrollment", () => ({ createAssistedEnrollment: jest.fn() }));
jest.mock("../api/endpoints", () => ({
  fetchMyCompliance: jest.fn(), startCompliance: jest.fn(), fetchComplianceSteps: jest.fn(),
  requestEvidenceUpload: jest.fn(), completeEvidenceUpload: jest.fn(), triggerDocumentProcessing: jest.fn(), submitComplianceGeolocation: jest.fn(),
}));
jest.mock("./assistedEvidenceVault", () => ({
  openAssistedPhoto: jest.fn(async () => new Uint8Array([1, 2, 3])),
  removeAssistedPhoto: jest.fn(async () => undefined),
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

const draft = {
  sponsorUserId: "sponsor-a", organizationId: "org-a",
  input: { first_name: "Ana", last_name: "López", email: "ana@example.com", client_request_id: "request-a", consent_confirmed: true as const },
};
const enrollment = {
  id: "enrollment-a", affiliate_id: "affiliate-a", affiliate_code: "AFF100",
  first_name: "Ana", last_name: "López", affiliate_status: "pending", access_status: "pending", created_at: "2026-09-29",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  (captureApiSessionGuard as jest.Mock).mockReturnValue(() => true);
  (createAssistedEnrollment as jest.Mock).mockResolvedValue(enrollment);
});

it("keeps drafts isolated by sponsor and organization and retries with the original request id", async () => {
  await savePendingAssisted(draft);
  expect(await listPendingAssisted("sponsor-b", "org-a")).toEqual([]);
  expect(await listPendingAssisted("sponsor-a", "org-b")).toEqual([]);
  (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError("timeout", "timeout"));
  const first = await syncPendingAssisted("sponsor-a", "org-a");
  expect(first.remaining).toBe(1);
  const second = await syncPendingAssisted("sponsor-a", "org-a");
  expect(second.remaining).toBe(0);
  expect(createAssistedEnrollment).toHaveBeenNthCalledWith(1, draft.input);
  expect(createAssistedEnrollment).toHaveBeenNthCalledWith(2, draft.input);
});

it("stops before sending any draft when the account or organization has changed", async () => {
  await savePendingAssisted(draft);
  (captureApiSessionGuard as jest.Mock).mockReturnValue(() => false);
  expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(1);
  expect(createAssistedEnrollment).not.toHaveBeenCalled();
});

it("retains both encrypted photos after a failed upload and deletes them only after accepted capture", async () => {
  await savePendingAssisted(draft);
  await replaceAssistedPhoto("sponsor-a", "org-a", "request-a", { evidenceType: "id_document_front", mimeType: "image/jpeg", fileName: "front.sealed", keyName: "front-key" });
  await replaceAssistedPhoto("sponsor-a", "org-a", "request-a", { evidenceType: "id_document_back", mimeType: "image/jpeg", fileName: "back.sealed", keyName: "back-key" });
  (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-a" });
  (fetchComplianceSteps as jest.Mock).mockResolvedValue([{ id: "document-a", step_type: "identity_document" }]);
  (requestEvidenceUpload as jest.Mock).mockResolvedValue({ evidence: { id: "evidence-a" }, upload: { url: "https://upload.example.test/photo", headers: { Host: "upload.example.test", "Content-Type": "image/jpeg" } } });
  (expoFetch as jest.Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
  expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(1);
  expect(removeAssistedPhoto).not.toHaveBeenCalled();
  expect((await listPendingAssisted("sponsor-a", "org-a"))[0].enrollmentId).toBe("enrollment-a");
  const result = await syncPendingAssisted("sponsor-a", "org-a");
  expect(result.remaining).toBe(0);
  expect(completeEvidenceUpload).toHaveBeenCalledWith("evidence-a", "enrollment-a");
  expect(triggerDocumentProcessing).toHaveBeenCalledWith("document-a", "mx_ine", "enrollment-a");
  expect(removeAssistedPhoto).toHaveBeenCalledTimes(2);
  expect((expoFetch as jest.Mock).mock.calls[0][1].headers).toEqual([["Content-Type", "image/jpeg"]]);
});

const location = { permission_status: "granted", capture_status: "captured", latitude: 19.43, longitude: -99.13, accuracy_meters: 12, captured_at: "2026-10-01T12:00:00.000Z" } as const;

it("keeps a saved location scoped to its sponsor and organization", async () => {
  await savePendingAssisted(draft);
  await expect(replaceAssistedGeolocation("sponsor-b", "org-a", "request-a", location)).rejects.toThrow();
  await expect(replaceAssistedGeolocation("sponsor-a", "org-b", "request-a", location)).rejects.toThrow();
  await replaceAssistedGeolocation("sponsor-a", "org-a", "request-a", location);
  expect((await listPendingAssisted("sponsor-a", "org-a"))[0].geolocation).toEqual(location);
  await replaceAssistedGeolocation("sponsor-a", "org-a", "request-a", undefined);
  expect((await listPendingAssisted("sponsor-a", "org-a"))[0].geolocation).toBeUndefined();
});

it("retains location after a failed sync and sends its original date to the assisted case", async () => {
  await savePendingAssisted(draft);
  await replaceAssistedGeolocation("sponsor-a", "org-a", "request-a", location);
  (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-a" });
  (fetchComplianceSteps as jest.Mock).mockResolvedValue([{ id: "document-a", step_type: "identity_document" }]);
  (submitComplianceGeolocation as jest.Mock).mockRejectedValueOnce(new ApiError("timeout", "timeout")).mockResolvedValue({ id: "geo-a" });
  expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(1);
  expect((await listPendingAssisted("sponsor-a", "org-a"))[0].geolocation).toEqual(location);
  expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(0);
  expect(submitComplianceGeolocation).toHaveBeenLastCalledWith("document-a", location, "enrollment-a");
  expect(triggerDocumentProcessing).not.toHaveBeenCalled();
});
