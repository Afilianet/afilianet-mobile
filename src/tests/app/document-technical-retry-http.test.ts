import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { retryDocumentProcessing } from "../../api/endpoints";
import { config } from "../../config/env";

/**
 * The reprocess request through the app's REAL HTTP client against a fake
 * local server (API #110 contract): POST to the retry route, no body, the
 * assisted header only in a sponsor's scope. Synthetic data; nothing beyond
 * 127.0.0.1.
 */
type Seen = { method?: string; url?: string; body: string; assisted?: string };
let server: Server;
let seen: Seen[] = [];

// Jest's fetch polyfill never reaches a socket; same minimal shim as face-match-auto-attempt-http.test.tsx.
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
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body, assisted: req.headers["x-assisted-enrollment-id"] as string | undefined });
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { id: "ocr-2", status: "pending", attempt_number: 2, capture_accepted: true, retry_available: false } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  config.apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
});

it("own session: POST to the retry route with no body and no assisted header", async () => {
  const result = await retryDocumentProcessing("doc-step");
  expect(seen).toHaveLength(1);
  expect(seen[0].method).toBe("POST");
  expect(seen[0].url).toBe("/api/v1/compliance/steps/doc-step/document-processing/retry");
  expect(seen[0].body).toBe("");
  expect(seen[0].assisted).toBeUndefined();
  expect(result).toMatchObject({ id: "ocr-2", status: "pending" });
});

it("sponsor's scope: the same request carries X-Assisted-Enrollment-ID", async () => {
  await retryDocumentProcessing("doc-step", "enrollment-a");
  expect(seen[0].assisted).toBe("enrollment-a");
  expect(seen[0].body).toBe("");
});
