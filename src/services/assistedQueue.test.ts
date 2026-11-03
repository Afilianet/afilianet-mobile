import { ApiError } from "../api/errors";
import { createAssistedEnrollment } from "../api/assistedEnrollment";
import { captureApiSessionGuard } from "../api/client";
import { completeEvidenceUpload, fetchComplianceSteps, fetchMyCompliance, requestEvidenceUpload, submitComplianceGeolocation, triggerDocumentProcessing } from "../api/endpoints";
import { fetch as expoFetch } from "expo/fetch";
import { listPendingAssisted, removePendingAssisted, retryBlockedAssisted, savePendingAssisted, serverStateOf, syncPendingAssisted, replaceAssistedPhoto, replaceAssistedGeolocation } from "./assistedQueue";
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

it("syncs a phone-only draft unchanged, with its original request id", async () => {
  const phoneOnly = {
    sponsorUserId: "sponsor-a", organizationId: "org-a",
    input: { first_name: "Ana", last_name: "López", phone: "+525512345678", client_request_id: "request-phone", consent_confirmed: true as const },
  };
  await savePendingAssisted(phoneOnly);
  const result = await syncPendingAssisted("sponsor-a", "org-a");
  expect(createAssistedEnrollment).toHaveBeenCalledWith(phoneOnly.input);
  expect(result).toEqual({ completed: [enrollment], remaining: 0, blocked: 0, error: undefined });
});

describe("organization refusals (API #92 assisted_enrollment_unavailable, API #86 kyc_unavailable) are not retried", () => {
  const refusal = (reason: string) => new ApiError("server", "No disponible.", 503, undefined, { reason });
  const front = { evidenceType: "id_document_front" as const, mimeType: "image/jpeg", fileName: "front.sealed", keyName: "front-key" };
  const back = { evidenceType: "id_document_back" as const, mimeType: "image/jpeg", fileName: "back.sealed", keyName: "back-key" };

  async function draftWithPhotos(id = "request-a") {
    await savePendingAssisted({ ...draft, input: { ...draft.input, client_request_id: id } });
    await replaceAssistedPhoto("sponsor-a", "org-a", id, { ...front, fileName: `${id}-front.sealed`, keyName: `${id}-front-key` });
    await replaceAssistedPhoto("sponsor-a", "org-a", id, { ...back, fileName: `${id}-back.sealed`, keyName: `${id}-back-key` });
  }

  it("creation refused (assisted_enrollment_unavailable): kept with its photos, never sent again on its own, nothing on the server", async () => {
    const reason = "assisted_enrollment_unavailable";
    await draftWithPhotos();
    (createAssistedEnrollment as jest.Mock).mockRejectedValue(refusal(reason));
    const first = await syncPendingAssisted("sponsor-a", "org-a");
    expect(first).toEqual({ completed: [], remaining: 1, blocked: 1, error: undefined });
    const [item] = await listPendingAssisted("sponsor-a", "org-a");
    expect(item.blocked?.reason).toBe(reason);
    expect(item.photos).toHaveLength(2);
    expect(serverStateOf(item)).toBe("not_created");
    await syncPendingAssisted("sponsor-a", "org-a");
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(createAssistedEnrollment).toHaveBeenCalledTimes(1);
    expect(removeAssistedPhoto).not.toHaveBeenCalled();
  });

  it("capture refused after creation (kyc_unavailable): kept, the enrollment is known to exist on the server", async () => {
    await draftWithPhotos();
    (fetchMyCompliance as jest.Mock).mockRejectedValue(refusal("kyc_unavailable"));
    expect((await syncPendingAssisted("sponsor-a", "org-a")).blocked).toBe(1);
    const [item] = await listPendingAssisted("sponsor-a", "org-a");
    expect(item).toMatchObject({ enrollmentId: "enrollment-a", blocked: { reason: "kyc_unavailable" } });
    expect(serverStateOf(item)).toBe("created");
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(createAssistedEnrollment).toHaveBeenCalledTimes(1);
    expect(fetchMyCompliance).toHaveBeenCalledTimes(1);
    expect(requestEvidenceUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["offline", new ApiError("offline", "Sin conexión")],
    ["timeout", new ApiError("timeout", "timeout")],
    ["503 without a reason", new ApiError("server", "Service Unavailable", 503)],
    ["another reason", new ApiError("server", "x", 503, undefined, { reason: "sms_unavailable" })],
  ])("transient (%s): not blocked, retried on the next sync with the same request id", async (_label, error) => {
    await savePendingAssisted(draft);
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(error);
    const first = await syncPendingAssisted("sponsor-a", "org-a");
    expect(first.blocked).toBe(0);
    expect(first.error).toBeTruthy();
    expect((await listPendingAssisted("sponsor-a", "org-a"))[0].blocked).toBeUndefined();
    expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(0);
    expect(createAssistedEnrollment).toHaveBeenNthCalledWith(2, draft.input);
  });

  it("uncertain answer (response lost after sending): the server state is unknown, never 'not created'", async () => {
    await savePendingAssisted(draft);
    expect(serverStateOf((await listPendingAssisted("sponsor-a", "org-a"))[0])).toBe("not_created");
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError("timeout", "timeout"));
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(serverStateOf((await listPendingAssisted("sponsor-a", "org-a"))[0])).toBe("unknown");
    // A later creation refusal for the same client_request_id settles it: nothing was created.
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(refusal("assisted_enrollment_unavailable"));
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(serverStateOf((await listPendingAssisted("sponsor-a", "org-a"))[0])).toBe("not_created");
  });

  it("organization or session change during sync is not a refusal: nothing is blocked", async () => {
    await savePendingAssisted(draft);
    let current = true;
    (captureApiSessionGuard as jest.Mock).mockReturnValue(() => current);
    (createAssistedEnrollment as jest.Mock).mockImplementationOnce(async () => { current = false; return enrollment; });
    await replaceAssistedPhoto("sponsor-a", "org-a", "request-a", front);
    await replaceAssistedPhoto("sponsor-a", "org-a", "request-a", back);
    const result = await syncPendingAssisted("sponsor-a", "org-a");
    expect(result.blocked).toBe(0);
    expect((await listPendingAssisted("sponsor-a", "org-a"))[0].blocked).toBeUndefined();
    // The blocked state belongs to its own organization's draft only.
    await savePendingAssisted({ ...draft, organizationId: "org-b", input: { ...draft.input, client_request_id: "request-b" } });
    (captureApiSessionGuard as jest.Mock).mockReturnValue(() => true);
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(refusal("assisted_enrollment_unavailable"));
    await syncPendingAssisted("sponsor-a", "org-b");
    expect((await listPendingAssisted("sponsor-a", "org-b"))[0].blocked?.reason).toBe("assisted_enrollment_unavailable");
    expect((await listPendingAssisted("sponsor-a", "org-a"))[0].blocked).toBeUndefined();
  });

  it("one refused draft does not hold back the others", async () => {
    await savePendingAssisted(draft);
    await savePendingAssisted({ ...draft, input: { ...draft.input, client_request_id: "request-b" } });
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(refusal("assisted_enrollment_unavailable")).mockResolvedValueOnce({ ...enrollment, id: "enrollment-b" });
    const result = await syncPendingAssisted("sponsor-a", "org-a");
    expect(result.completed.map((value) => value.id)).toEqual(["enrollment-b"]);
    expect(result).toMatchObject({ remaining: 1, blocked: 1 });
  });

  it("manual retry sends it again with the original request id", async () => {
    await savePendingAssisted(draft);
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(refusal("assisted_enrollment_unavailable"));
    await syncPendingAssisted("sponsor-a", "org-a");
    await retryBlockedAssisted("request-a");
    expect((await syncPendingAssisted("sponsor-a", "org-a")).remaining).toBe(0);
    expect(createAssistedEnrollment).toHaveBeenNthCalledWith(2, draft.input);
  });

  it("person already activated (replay answers access_status ready): stopped as assisted_access_claimed, photos kept, nothing uploaded, never retried", async () => {
    await draftWithPhotos();
    (createAssistedEnrollment as jest.Mock).mockResolvedValue({ ...enrollment, access_status: "ready" });
    expect((await syncPendingAssisted("sponsor-a", "org-a")).blocked).toBe(1);
    const [item] = await listPendingAssisted("sponsor-a", "org-a");
    expect(item).toMatchObject({ enrollmentId: "enrollment-a", blocked: { reason: "assisted_access_claimed" } });
    expect(item.photos).toHaveLength(2);
    expect(serverStateOf(item)).toBe("created");
    expect(fetchMyCompliance).not.toHaveBeenCalled();
    expect(requestEvidenceUpload).not.toHaveBeenCalled();
    // Permanent: an explicit retry does not reopen it either.
    await retryBlockedAssisted("request-a");
    expect((await listPendingAssisted("sponsor-a", "org-a"))[0].blocked?.reason).toBe("assisted_access_claimed");
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(createAssistedEnrollment).toHaveBeenCalledTimes(1);
  });

  it("capture endpoints answering 409 assisted_access_claimed stop it the same way", async () => {
    await draftWithPhotos();
    (fetchMyCompliance as jest.Mock).mockRejectedValue(new ApiError("conflict", "La persona ya activó su cuenta; ya no es posible capturar por ella.", 409, undefined, { reason: "assisted_access_claimed" }));
    expect((await syncPendingAssisted("sponsor-a", "org-a")).blocked).toBe(1);
    expect(serverStateOf((await listPendingAssisted("sponsor-a", "org-a"))[0])).toBe("created");
    await syncPendingAssisted("sponsor-a", "org-a");
    expect(fetchMyCompliance).toHaveBeenCalledTimes(1);
  });

  it("a generic 404 (wrong id, other organization or sponsor) stays transient", async () => {
    await draftWithPhotos();
    // (A 404 from fetchMyCompliance means "no case yet" and starts one; uploads are where a wrong id shows.)
    (fetchMyCompliance as jest.Mock).mockResolvedValue({ id: "case-a" });
    (fetchComplianceSteps as jest.Mock).mockResolvedValue([{ id: "document-a", step_type: "identity_document" }]);
    (requestEvidenceUpload as jest.Mock).mockRejectedValueOnce(new ApiError("not_found", "No encontrado.", 404));
    expect((await syncPendingAssisted("sponsor-a", "org-a")).blocked).toBe(0);
    expect((await listPendingAssisted("sponsor-a", "org-a"))[0].blocked).toBeUndefined();
  });

  it("a person activated after the draft was saved, with nothing left to send, completes as before", async () => {
    await savePendingAssisted(draft);
    (createAssistedEnrollment as jest.Mock).mockResolvedValue({ ...enrollment, access_status: "ready" });
    expect(await syncPendingAssisted("sponsor-a", "org-a")).toMatchObject({ remaining: 0, blocked: 0 });
  });

  it("discarding deletes only this draft's own photos, never one another pending draft references", async () => {
    await draftWithPhotos("request-a");
    await savePendingAssisted({ ...draft, input: { ...draft.input, client_request_id: "request-b" } });
    // Defensive: the vault gives each capture its own file, but a shared reference must survive.
    await replaceAssistedPhoto("sponsor-a", "org-a", "request-b", { ...front, fileName: "request-a-front.sealed", keyName: "request-a-front-key" });
    await removePendingAssisted("request-a");
    expect(removeAssistedPhoto).toHaveBeenCalledTimes(1);
    expect(removeAssistedPhoto).toHaveBeenCalledWith(expect.objectContaining({ fileName: "request-a-back.sealed" }));
    expect((await listPendingAssisted("sponsor-a", "org-a")).map((item) => item.input.client_request_id)).toEqual(["request-b"]);
  });
});
