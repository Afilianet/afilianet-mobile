import { configureApiClient } from "../../api/client";
import { isAssistedSyncInProgress, type PendingAssistedEnrollment } from "../../services/assistedQueue";
import { checkServerBeforeDiscard, discardConfirmation } from "../../utils/assistedPending";

/**
 * API #92 read-only lookup before discarding, against simulated HTTP (the
 * real client; only global fetch is replaced). Only the route's own 404
 * reason means "not found"; everything else stays "no pudimos confirmar".
 * The creation is never replayed to find out.
 */
jest.mock("../../services/assistedQueue", () => ({ ...jest.requireActual("../../services/assistedQueue"), isAssistedSyncInProgress: jest.fn(() => false) }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 50 } }));

const originalFetch = global.fetch;
const fetchMock = jest.fn();
let organizationId: string | null = "org-a";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const LOOKUP = "https://api.test/api/v1/affiliates/me/assisted-enrollments/by-request/request-a";
const enrollment = {
  id: "enrollment-a", affiliate_id: "affiliate-a", affiliate_code: "AFF100", first_name: "Ana", last_name: "López",
  affiliate_status: "pending", access_status: "pending", created_at: "2026-10-27T00:00:00Z",
};
const item: PendingAssistedEnrollment = {
  sponsorUserId: "sponsor-a", organizationId: "org-a", createAttempted: true,
  input: { first_name: "Ana", last_name: "López", email: "ana@example.com", client_request_id: "request-a", consent_confirmed: true },
};

beforeEach(() => {
  fetchMock.mockReset();
  organizationId = "org-a";
  global.fetch = fetchMock as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => organizationId });
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

function onlyReadOnlyLookups() {
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toBe(LOOKUP);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
  }
}

it("nothing ever left the phone: no request at all, and nothing was created", async () => {
  const check = await checkServerBeforeDiscard({ ...item, createAttempted: false });
  expect(check).toEqual({ kind: "not_needed" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(discardConfirmation({ ...item, createAttempted: false }, check)).toMatch(/^No se creó ningún registro/);
});

it("found, not activated: one GET with the item's organization; discarding only deletes the local copy", async () => {
  fetchMock.mockResolvedValueOnce(json({ data: enrollment }));
  const check = await checkServerBeforeDiscard(item);
  expect(check).toEqual({ kind: "found", enrollment });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers["X-Organization-ID"]).toBe("org-a");
  onlyReadOnlyLookups();
  expect(discardConfirmation(item, check)).toBe("El registro de Ana López existe en la organización y aún no se activa. Descartar solo borra la copia de este teléfono (fotos y ubicación sin enviar); el registro y lo ya enviado se conservan en el servidor.");
});

it("found, already activated", async () => {
  fetchMock.mockResolvedValueOnce(json({ data: { ...enrollment, access_status: "ready" } }));
  const check = await checkServerBeforeDiscard(item);
  expect(discardConfirmation(item, check)).toMatch(/existe en la organización y la persona ya activó su cuenta\. Descartar solo borra la copia de este teléfono/);
});

it("the route's own not-found: says the server holds none now, never that it never existed", async () => {
  fetchMock.mockResolvedValueOnce(json({ message: "No encontrado.", reason: "assisted_enrollment_not_found" }, 404));
  const check = await checkServerBeforeDiscard(item);
  expect(check).toEqual({ kind: "not_found" });
  const text = discardConfirmation(item, check);
  expect(text).toBe("El servidor no tiene ahora un registro para esta solicitud. Se borrarán de este teléfono los datos, las fotos y la ubicación guardados de Ana López.");
  expect(text).not.toMatch(/nunca|No se creó/);
  onlyReadOnlyLookups();
});

it.each([
  ["older API or missing route (404 without reason)", () => fetchMock.mockResolvedValueOnce(json({ message: "Not Found" }, 404))],
  ["no permission (403)", () => fetchMock.mockResolvedValueOnce(json({ message: "This action is unauthorized." }, 403))],
  ["session expired (401)", () => fetchMock.mockResolvedValueOnce(json({ message: "Unauthenticated." }, 401))],
  ["server error (500)", () => fetchMock.mockResolvedValueOnce(json({ message: "Server Error" }, 500))],
  ["offline", () => fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"))],
  ["timeout", () => fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
  }))],
])("%s: stays «no pudimos confirmar»", async (_label, arrange) => {
  arrange();
  const check = await checkServerBeforeDiscard(item);
  expect(check).toEqual({ kind: "unavailable" });
  expect(discardConfirmation(item, check)).toMatch(/^No pudimos confirmar si el registro de Ana López llegó a crearse/);
  onlyReadOnlyLookups();
});

it("organization changed while asking: the answer is not trusted", async () => {
  fetchMock.mockImplementationOnce(async () => { organizationId = "org-b"; return json({ data: enrollment }); });
  expect(await checkServerBeforeDiscard(item)).toEqual({ kind: "unavailable" });
});

it("a draft from another organization than the active one is not looked up", async () => {
  organizationId = "org-b";
  expect(await checkServerBeforeDiscard(item)).toEqual({ kind: "unavailable" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("without a server answer, local knowledge still applies: a known enrollment exists; an earlier creation refusal is not enough", async () => {
  const unavailable = { kind: "unavailable" } as const;
  expect(discardConfirmation({ ...item, enrollmentId: "enrollment-a" }, unavailable)).toMatch(/^El registro de Ana López ya existe en la organización/);
  expect(discardConfirmation({ ...item, blocked: { reason: "assisted_enrollment_unavailable", at: "" } }, unavailable)).toMatch(/^No pudimos confirmar/);
});

it("a sync in progress could still be sending this draft: not asked, stays uncertain", async () => {
  (isAssistedSyncInProgress as jest.Mock).mockReturnValueOnce(true);
  expect(await checkServerBeforeDiscard(item)).toEqual({ kind: "unavailable" });
  expect(fetchMock).not.toHaveBeenCalled();
});
