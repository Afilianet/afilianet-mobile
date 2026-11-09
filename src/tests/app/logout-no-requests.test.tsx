import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { fetchMyPrivacy, myPrivacyKey } from "../../api/privacy";
import { queryClient } from "../../api/queryClient";
import { useAuth, type AuthContextValue } from "../../auth/AuthContext";
import { AuthProvider } from "../../auth/AuthProvider";
import { useApiQuery } from "../../hooks/useApiQuery";
import { markPrivacyReviewRequired, usePrivacyReview } from "../../state/privacyReview";

/**
 * Physical round P3 (2026-10-28): each sign-out was followed by one GET me/privacy answered 401. The
 * session's screens were still mounted when the cache was cleared, and the review state's change
 * re-rendered them with the user still set, so they asked again. Signing out must publish the
 * signed-out state first: after auth/logout, nothing else is requested.
 */
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 500 } }));

const calls: { route: string; authorized: boolean }[] = [];
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? "GET"} ${String(url).replace("https://api.test/api/v1", "")}`;
  calls.push({ route, authorized: Boolean((init?.headers as Record<string, string> | undefined)?.Authorization) });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (route === "POST /auth/login") return json(200, { token: "tok-a", user: { id: "user-a" } });
  if (route === "GET /me") return json(200, { data: { id: "user-a", first_name: "A" } });
  if (route === "POST /auth/logout") return json(200, { message: "ok" });
  if (route === "DELETE /push/devices") return json(409, { reason: "privacy_notice_review_required", pending: { privacy_notice: null, organization_notice: null } });
  return json(200, {
    data: {
      required: true, enforce_review: true, organizations: [],
      privacy_notice: { current: null, change_class: "review_required", summary_of_changes: null, action_required: "review", acknowledged_current: false, last_acknowledged: null, purposes: [] },
    },
  });
});

let auth: AuthContextValue;
function SessionScreens() {
  const current = useAuth();
  useEffect(() => {
    auth = current;
  });
  // What stays mounted in the app while signing out: the root's review state and the /me/privacy observers.
  usePrivacyReview();
  useApiQuery(myPrivacyKey(current.user?.id), fetchMyPrivacy, { enabled: current.status === "signedIn" && Boolean(current.user) });
  return null;
}

const originalFetch = global.fetch;
beforeAll(() => {
  // No garbage-collection timers left behind by the shared client.
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
});
beforeEach(() => {
  calls.length = 0;
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  queryClient.clear();
});

it("after auth/logout, a mounted session asks for nothing else, even while a review was blocking it", async () => {
  await act(async () => {
    await render(<QueryClientProvider client={queryClient}><AuthProvider><SessionScreens /></AuthProvider></QueryClientProvider>);
  });
  await waitFor(() => expect(auth.status).toBe("signedOut"));
  await act(async () => {
    await auth.signIn("person@example.test", "clave-ficticia");
  });
  await waitFor(() => expect(calls.some((call) => call.route === "GET /me/privacy")).toBe(true));
  // As in P3: the server was blocking this session for a review.
  act(() => markPrivacyReviewRequired({ privacy_notice: { version: "v2", sha256: "x" }, organization_notice: null }, null));

  calls.length = 0;
  await act(async () => {
    await auth.signOut();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(auth.status).toBe("signedOut");
  expect(calls.map((call) => call.route)).toEqual(["DELETE /push/devices", "POST /auth/logout"]);
  expect(calls.every((call) => call.authorized)).toBe(true);
});
