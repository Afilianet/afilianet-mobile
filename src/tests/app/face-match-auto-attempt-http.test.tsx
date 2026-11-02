import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Text } from "react-native";
import { FaceMatchStep } from "../../components/compliance/steps/FaceMatchStep";
import { config } from "../../config/env";
import { useLivenessResult } from "../../hooks/useLivenessResult";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { ComplianceStep, Organization } from "../../types/api";

/**
 * Same order of events as face-match-auto-attempt.test.tsx, but through the
 * app's REAL HTTP client (src/api/client.ts) against a fake local server, so
 * the requests the data layer makes can be compared with the staging log of
 * 2026-11-02. The server plays the API: face-match-result answers 404 until it
 * has answered a completed liveness result, and from then on returns the
 * attempt the API created on its own. Synthetic data only; no network beyond
 * 127.0.0.1.
 */
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const LIVENESS_STEP = "liveness-step";
const FACE_MATCH_STEP = "fm-step";
const ORG = { id: "org-sintetica", name: "Organización sintética", identity_verification_available: true } as Organization;
const orgValue: OrganizationContextValue = {
  status: "ready", organizations: [ORG], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};
const faceMatchStep = {
  id: FACE_MATCH_STEP, step_type: "face_match", status: "pending", provider: null, score: null, attempt_count: 0, completed_at: null,
  created_at: "2026-11-02T17:14:39Z", configured_provider: "afilianet", provider_actionable: true, provider_unavailable_reason: null,
} as ComplianceStep;

let server: Server;
let requests: string[] = [];
let livenessReads = 0;
let attemptCreated = false;

function session(status: "processing" | "completed") {
  return {
    id: "liveness-1", session_id: "sesion-sintetica", region: "us-east-1", status, verdict: status === "completed" ? "review" : null,
    failure_reason: null, attempt_number: 1, started_at: "2026-11-02T17:15:45Z", completed_at: status === "completed" ? "2026-11-02T17:16:01Z" : null,
    expires_at: null, created_at: "2026-11-02T17:15:45Z",
  };
}

// Jest's react-native environment replaces fetch with a polyfill that never
// reaches a socket; this minimal one (127.0.0.1 only) gives the client the
// members it reads: ok, status, statusText, headers.get and text().
function localFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  if (!url.startsWith("http://127.0.0.1:")) return Promise.reject(new Error(`blocked: ${url}`));
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: init.method ?? "GET", headers: init.headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({
        ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
        status: res.statusCode ?? 0,
        statusText: res.statusMessage ?? "",
        headers: { get: (name: string) => (res.headers[name.toLowerCase()] as string | undefined) ?? null },
        text: async () => body,
      }));
    });
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

beforeAll(async () => {
  (globalThis as { fetch: unknown }).fetch = localFetch;
  server = createServer((req, res) => {
    const path = (req.url ?? "").replace(/^\/api\/v1/, "");
    requests.push(`${req.method} ${path}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (path === `/compliance/steps/${LIVENESS_STEP}/liveness-result`) {
      livenessReads += 1;
      // First read still processing; the second one completes and, like the API, creates the face-match attempt.
      if (livenessReads === 1) return json(200, { data: session("processing") });
      attemptCreated = true;
      return json(200, { data: session("completed") });
    }
    if (path === `/compliance/steps/${FACE_MATCH_STEP}/face-match-result`) {
      if (!attemptCreated) return json(404, { message: "No query results" });
      return json(200, { data: { id: "fm-attempt-1", status: "pending", verdict: null, failure_reason: null, attempt_number: 1 } });
    }
    return json(404, { message: "not in this fake" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  config.apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function Round() {
  const liveness = useLivenessResult(LIVENESS_STEP);
  // In the app the steps refetch makes face_match current once liveness completes; this stands in for that.
  const livenessDone = liveness.data?.status === "completed";
  return (
    <>
      <Text testID="liveness">{liveness.data?.status ?? "none"}</Text>
      <FaceMatchStep step={faceMatchStep} attempt={jest.fn()} isPending={false} processingOnly={!livenessDone} />
    </>
  );
}

it("after liveness completes, the data layer reads face-match-result again and shows the server's attempt, not a selfie capture", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <OrganizationContext.Provider value={orgValue}>
        <Round />
      </OrganizationContext.Provider>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(view.getByTestId("liveness").props.children).toBe("completed"), { timeout: 8000 });
  await waitFor(() => expect(view.getByText("Esperando la selfie")).toBeTruthy(), { timeout: 8000 });
  expect(view.queryByText("Aún no capturado")).toBeNull();

  const faceMatchReads = requests.filter((r) => r.endsWith("/face-match-result"));
  const livenessCompletedAt = requests.findIndex((r, i) => r.endsWith("/liveness-result") && requests.slice(0, i + 1).filter((x) => x.endsWith("/liveness-result")).length === 2);
  // The 404 before completion, then at least one read AFTER the completed liveness result.
  expect(faceMatchReads.length).toBeGreaterThanOrEqual(2);
  expect(requests.slice(livenessCompletedAt + 1).some((r) => r.endsWith("/face-match-result"))).toBe(true);
  expect(requests.some((r) => r.includes("face-match-processing") || r.includes("evidence/uploads"))).toBe(false);
  // Order as in the staging log, plus the reads #84 adds (later polls of the pending attempt may follow).
  expect(requests.slice(0, 4)).toEqual([
    `GET /compliance/steps/${FACE_MATCH_STEP}/face-match-result`,
    `GET /compliance/steps/${LIVENESS_STEP}/liveness-result`,
    `GET /compliance/steps/${LIVENESS_STEP}/liveness-result`,
    `GET /compliance/steps/${FACE_MATCH_STEP}/face-match-result`,
  ]);
}, 20000);
