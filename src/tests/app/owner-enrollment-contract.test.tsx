import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import OwnerEnrollmentScreen from "../../app/owner-enrollment";
import { ownerSelfEnrollment } from "../../state/membership";
import type { Organization } from "../../types/api";
import contract from "../support/api-contract/owner-affiliate-enrollment-89c5f57.json";

/**
 * API #158's captured examples (89c5f57, 01-12), served to the real API client
 * and screen: the request the app makes and the body it sends must be the
 * example's. Nothing synthetic: 12 is the GET /privacy/notice of the same run.
 */
type Example = { request: { method: string; path: string; body?: Record<string, unknown> }; status: number; response: unknown };
const ex = (name: string) => (contract.examples as Record<string, Example>)[name];
const LIST = ex("03-me-organizations-owner");
const GET = ex("04-get-available");
const JOINED = ex("07-post-201-joined");
const ALREADY = ex("08-post-200-already-affiliated");
const NOT_OWNER = ex("11-get-403-not-owner");
const AFTER = ex("10-me-organizations-after");
const orgs = (LIST.response as { data: Organization[] }).data;
const owner = orgs[0];
const GENERAL_NOTICE = ex("12-get-privacy-notice-general");

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 500 } }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
const mockReload = jest.fn(async () => undefined);
let mockActive: unknown = null;
jest.mock("../../state/OrganizationContext", () => ({
  useOrganization: () => ({ activeOrganization: mockActive, refresh: jest.fn(), reloadOrganizations: mockReload }),
}));
// The example's own request id, so the body compares one to one.
jest.mock("expo-crypto", () => ({ randomUUID: () => "6d1f6f0e-3c43-4c1b-9a51-3f0f3b0a7e21" }));

const calls: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];
let served: Record<string, { status: number; response: unknown }> = {};
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  mockActive = owner;
  served = {
    "GET /api/v1/privacy/notice": GENERAL_NOTICE,
    [`GET /api/v1${GET.request.path}`]: GET,
    [`POST /api/v1${JOINED.request.path}`]: JOINED,
  };
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => owner.id });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    calls.push({ method, path, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = served[`${method} ${path}`] ?? { status: 404, response: { message: "Not Found." } };
    return { ok: answer.status < 300, status: answer.status, statusText: String(answer.status), headers: { get: () => null }, json: async () => answer.response, text: async () => JSON.stringify(answer.response) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

type View = Awaited<ReturnType<typeof render>>;
async function mount() {
  let view!: View;
  await act(async () => { view = await render(<OwnerEnrollmentScreen />); });
  return view;
}

it("12 is the general notice 04 references and 07 sends", () => {
  const general = (GENERAL_NOTICE.response as { data: { version: string; content_sha256: string } }).data;
  const shown = (GET.response as { data: { privacy: { privacy_notice: { version: string; sha256: string } } } }).data.privacy.privacy_notice;
  expect({ version: general.version, sha256: general.content_sha256 }).toEqual(shown);
  expect(JOINED.request.body!.privacy_notice).toEqual(shown);
});

it("03 and 10: the list's field decides the Home action, before and after", () => {
  expect(ownerSelfEnrollment(owner)).toEqual({ available: true, suggested: true });
  // Created with the box unticked (declined): still offered, not suggested.
  expect(ownerSelfEnrollment(orgs[1])).toEqual({ available: true, suggested: false });
  const after = (AFTER.response as { data: Organization[] }).data.find((org) => org.id === owner.id)!;
  expect(after.has_affiliate_profile).toBe(true);
  expect(ownerSelfEnrollment(after).available).toBe(false);
});

it("04 → 07: the GET has no X-Organization-ID; the POST body is the example's, one to one; then the list reloads", async () => {
  const view = await mount();
  await waitFor(() => expect(view.getByTestId("notice-link-general")).toBeTruthy());
  expect(view.getByTestId("notice-link-organization")).toBeTruthy();
  const get = calls.find((call) => call.path.endsWith("/affiliate-profile"))!;
  expect(get.headers["X-Organization-ID"]).toBeUndefined();

  await act(async () => { fireEvent.press(view.getByTestId("notice-confirmation")); });
  await act(async () => { fireEvent.press(view.getByText("Incorporarme")); });
  const sent = calls.find((call) => call.method === "POST")!;
  expect(sent.path).toBe(`/api/v1${JOINED.request.path}`);
  expect(sent.headers["X-Organization-ID"]).toBeUndefined();
  expect(sent.body).toEqual(JOINED.request.body);
  expect(mockReload).toHaveBeenCalled();
  // Only these three requests: nothing personal, no KYC, no invitation.
  expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
    `GET /api/v1${GET.request.path}`, "GET /api/v1/privacy/notice", `POST /api/v1${JOINED.request.path}`,
  ]);
});

it("08: already_affiliated reads as «nothing changed»", async () => {
  served[`POST /api/v1${ALREADY.request.path}`] = ALREADY;
  const view = await mount();
  await waitFor(() => expect(view.getByTestId("notice-confirmation")).toBeTruthy());
  await act(async () => { fireEvent.press(view.getByTestId("notice-confirmation")); });
  await act(async () => { fireEvent.press(view.getByText("Incorporarme")); });
  expect(view.getByTestId("owner-enrollment-already")).toBeTruthy();
});

it("11: 403 not_owner on the GET shows no form", async () => {
  served[`GET /api/v1${NOT_OWNER.request.path}`] = NOT_OWNER;
  const view = await mount();
  await waitFor(() => expect(view.getByTestId("owner-enrollment-unavailable")).toBeTruthy());
  expect(calls.some((call) => call.method === "POST")).toBe(false);
});
