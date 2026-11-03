import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Alert } from "react-native";
import ComplianceScreen from "../../app/compliance";
import { isTechnicalFailureReason } from "../../components/compliance/document-capture/documentCaptureCopy";
import { config } from "../../config/env";
import { AssistedComplianceContext, AssistedPersonNameContext } from "../../state/ComplianceScopeContext";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Organization } from "../../types/api";

/**
 * Contract check against the API integration candidate (#115 @ 29dc5a1): the
 * bodies in support/api-contract/kyc-candidate-29dc5a1.json were produced by
 * that candidate's own HTTP layer (synthetic data). A fake local server
 * replays them EXACTLY to the app's real HTTP client and screens, so parsing,
 * reason codes and the decisions taken on them are checked as served --
 * #86 (same-photos document retry) and #85 (own terms acceptance on a
 * resolved step). Nothing leaves 127.0.0.1.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

type Sample = { status: number; body: Record<string, unknown> };
type Json = Record<string, unknown>;
const SAMPLES = JSON.parse(readFileSync(join(__dirname, "../support/api-contract/kyc-candidate-29dc5a1.json"), "utf8")) as Record<string, Sample>;
const sample = (key: string): Sample => JSON.parse(JSON.stringify(SAMPLES[key])) as Sample;
const data = (key: string) => sample(key).body.data as Json;
const stepsOf = (caseData: Json) => caseData.steps as Json[];
const stepOf = (caseData: Json, type: string) => stepsOf(caseData).find((step) => step.step_type === type) as Json;

const ORG = { id: "org-sintetica", name: "Organización sintética", my_role: "affiliate", my_membership_status: "active" } as Organization;
const orgValue: OrganizationContextValue = {
  status: "ready", organizations: [ORG], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn(),
};

/** What the fake API answers: a function of the request, decided per test. */
type Route = (method: string, path: string) => Sample | undefined;
let route: Route = () => undefined;
let seen: { method: string; path: string; body: string }[] = [];
let server: Server;
let queryClient: QueryClient;

// Jest's fetch polyfill never reaches a socket; same minimal shim as the other *-http tests.
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
      const method = req.method ?? "GET";
      const path = (req.url ?? "").replace(/^\/api\/v1/, "").split("?")[0];
      seen.push({ method, path, body });
      const answer = path === "/affiliates/me"
        ? { status: 200, body: { data: { id: "aff-1", affiliate_code: "AFF1", status: "pending" } } }
        : route(method, path) ?? { status: 404, body: { message: "not in this fake" } };
      res.writeHead(answer.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer.body));
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
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  jest.restoreAllMocks();
  queryClient.clear();
});

async function renderScreen(assisted?: { id: string; name: string }) {
  const screen = (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue}>
        <ComplianceScreen />
      </OrganizationContext.Provider>
    </QueryClientProvider>
  );
  let view!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    view = await render(assisted ? (
      <AssistedComplianceContext.Provider value={assisted.id}>
        <AssistedPersonNameContext.Provider value={assisted.name}>{screen}</AssistedPersonNameContext.Provider>
      </AssistedComplianceContext.Provider>
    ) : screen);
  });
  return view;
}

/** GET /compliance and /compliance/steps answer the same case snapshot. */
function caseRoutes(caseData: () => Json): Route {
  return (method, path) => {
    if (method === "GET" && path === "/compliance") return { status: 200, body: { data: caseData() } };
    if (method === "GET" && path === "/compliance/steps") return { status: 200, body: { data: stepsOf(caseData()) } };
    return undefined;
  };
}

const uploads = () => seen.filter((r) => /evidence|document-capture|liveness|face-match/.test(r.path) && r.method !== "GET");
const autoConfirm = () => jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Aceptar")?.onPress?.());

describe("served fields and reason codes", () => {
  it("document results carry the fields the app reads, with the types it expects", () => {
    for (const key of ["document_capture_202", "document_result_failed_technical", "retry_202", "retry_202_second", "document_result_exhausted"]) {
      const result = data(key);
      expect(typeof result.id).toBe("string");
      expect(typeof result.capture_accepted).toBe("boolean");
      expect(typeof result.retry_available).toBe("boolean");
      expect(typeof result.executions_used).toBe("number");
      expect(result.executions_max).toBe(3);
      expect(typeof result.attempt_number).toBe("number");
      // Served as null while nothing was extracted (the app no longer assumes arrays).
      expect(result.extracted_fields === null || Array.isArray(result.extracted_fields)).toBe(true);
      expect(result.validation_checks === null || Array.isArray(result.validation_checks)).toBe(true);
      // Never true for a run still pending or processing (stuck runs are failed as processing_timeout first).
      if (result.status === "pending" || result.status === "processing") expect(result.retry_available).toBe(false);
    }
    expect(isTechnicalFailureReason(data("document_result_failed_technical").failure_reason as string)).toBe(true);
    expect(isTechnicalFailureReason(data("document_result_exhausted").failure_reason as string)).toBe(true);
    expect(isTechnicalFailureReason("processing_timeout")).toBe(true);
  });

  it("every refusal carries a reason the app handles, except the 422 for an acceptance already own (message only)", () => {
    expect(sample("retry_409_in_progress").body.reason).toBe("document_processing_in_progress");
    expect(sample("retry_409_limit").body.reason).toBe("document_retry_limit_reached");
    expect(sample("retry_422_case_closed")).toMatchObject({ status: 422, body: { reason: "case_closed" } });
    expect(sample("terms_409_not_published").body.reason).toBe("terms_not_published");
    expect(sample("terms_422_already_own").status).toBe(422);
    expect(sample("terms_422_already_own").body.reason).toBeUndefined();
  });

  it("terms steps carry needs_own_acceptance, requires_own_session and accepted_via with the expected values", () => {
    for (const key of ["compliance_in_progress_after_exhaustion", "compliance_needs_own_acceptance", "terms_replace_200"]) {
      const terms = stepOf(data(key), "terms_acceptance");
      expect(typeof terms.needs_own_acceptance).toBe("boolean");
      expect(typeof terms.requires_own_session).toBe("boolean");
      expect([null, "own_session", "assisted_enrollment"]).toContain(terms.accepted_via);
    }
    expect(stepOf(data("compliance_needs_own_acceptance"), "terms_acceptance")).toMatchObject({ status: "passed", needs_own_acceptance: true, accepted_via: "assisted_enrollment" });
    expect(stepOf(data("terms_replace_200"), "terms_acceptance")).toMatchObject({ status: "passed", needs_own_acceptance: false, accepted_via: "own_session" });
    expect(data("terms_replace_200").status).toBe("manual_review");
  });
});

describe("document: same-photos retry with the served bodies (#86)", () => {
  const caseData = () => data("compliance_in_progress_after_exhaustion");
  const docStep = () => stepOf(caseData(), "identity_document").id as string;

  it("technical failure → retry (no body, nothing uploaded) → polls the new run → exhausted: in_progress copy naming the terms step", async () => {
    let result = sample("document_result_failed_technical");
    const base = caseRoutes(caseData);
    route = (method, path) => {
      if (path === `/compliance/steps/${docStep()}/document-result`) return result;
      if (method === "POST" && path === `/compliance/steps/${docStep()}/document-processing/retry`) {
        result = sample("retry_202");
        return { status: 202, body: sample("retry_202").body };
      }
      return base(method, path);
    };
    const view = await renderScreen();
    expect(await view.findByText("Volver a procesar las fotos")).toBeTruthy();
    expect(view.getByText("Quedan 2 intentos.")).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText("Volver a procesar las fotos"));
    });
    const retries = seen.filter((r) => r.path.endsWith("/document-processing/retry"));
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({ method: "POST", body: "" });
    expect((await view.findByTestId("document-retry-processing")).props.children).toMatch(/procesando de nuevo las fotos guardadas/);

    // The server's own retries use the remaining executions; the last one fails too.
    result = sample("document_result_exhausted");
    expect(await view.findByText(/No pudimos leer los datos de tu credencial\. Tus fotos quedaron guardadas/, {}, { timeout: 8000 })).toBeTruthy();
    expect(view.getByTestId("document-retry-next-step").props.children).toBe("Siguiente paso: Aceptación de términos.");
    expect(view.queryByText("Volver a procesar las fotos")).toBeNull();
    expect(view.queryByText(/rechaz/i)).toBeNull();
    expect(view.queryByText(/(en|pasó a|pasará a) revisión/i)).toBeNull();
    expect(uploads()).toHaveLength(0);
  }, 20000);

  it.each([
    ["retry_409_in_progress", null],
    ["retry_409_limit", /No pudimos leer los datos de tu credencial/],
    ["retry_422_case_closed", /Esta verificación ya está cerrada\./],
  ] as const)("%s: handled as served, re-read, never retried on its own", async (key, text) => {
    const base = caseRoutes(caseData);
    route = (method, path) => {
      if (path === `/compliance/steps/${docStep()}/document-result`) return sample("document_result_failed_technical");
      if (method === "POST" && path.endsWith("/document-processing/retry")) return sample(key);
      return base(method, path);
    };
    const view = await renderScreen();
    await view.findByText("Volver a procesar las fotos");
    const readsBefore = seen.filter((r) => r.path.endsWith("/document-result")).length;
    await act(async () => {
      fireEvent.press(view.getByText("Volver a procesar las fotos"));
    });
    if (text) expect(await view.findByText(text)).toBeTruthy();
    else expect(view.queryByText(/Algo salió mal|en curso/)).toBeNull();
    await waitFor(() => expect(seen.filter((r) => r.path.endsWith("/document-result")).length).toBeGreaterThan(readsBefore));
    expect(seen.filter((r) => r.path.endsWith("/document-processing/retry"))).toHaveLength(1);
    expect(uploads()).toHaveLength(0);
  });
});

describe("terms: own acceptance on a resolved step with the served bodies (#85)", () => {
  const published = () => stepOf(data("terms_replace_200"), "terms_acceptance").terms_document as Json;
  /** compliance_needs_own_acceptance as served, optionally with the published document of terms_replace_200. */
  const needsOwn = (withDocument: boolean, overrides: Json = {}) => {
    const caseData = data("compliance_needs_own_acceptance");
    const terms = stepOf(caseData, "terms_acceptance");
    if (withDocument) terms.terms_document = published();
    Object.assign(terms, overrides);
    return caseData;
  };

  it("as served (needs_own_acceptance, no document published): «no publicados», no button", async () => {
    route = caseRoutes(() => needsOwn(false));
    const view = await renderScreen();
    expect(await view.findByTestId("terms-not-published")).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
  });

  it("with the published document: the button sends that version and hash; terms_replace_200 then reads as recorded, case still in review", async () => {
    let accepted = false;
    route = (method, path) => {
      const termsId = stepOf(needsOwn(true), "terms_acceptance").id as string;
      if (method === "POST" && path === `/compliance/steps/${termsId}/attempt`) {
        accepted = true;
        return sample("terms_replace_200");
      }
      return caseRoutes(() => (accepted ? data("terms_replace_200") : needsOwn(true)))(method, path);
    };
    const view = await renderScreen();
    expect(await view.findByTestId("terms-needs-own-acceptance")).toBeTruthy();
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });
    const attempt = seen.find((r) => r.method === "POST" && r.path.endsWith("/attempt"));
    expect(JSON.parse(attempt?.body ?? "{}")).toEqual({ accepted: true, document_version: published().version, document_sha256: published().content_sha256 });
    expect((await view.findByTestId("terms-own-acceptance-recorded")).props.children).toBe(
      "Registramos tu aceptación desde tu cuenta. Tu verificación sigue pendiente de la revisión de la organización.",
    );
    expect(view.queryByText(/aprobad/i)).toBeNull();
  });

  it.each([
    ["terms_409_not_published", "Los términos de esta verificación ya no están publicados. No se registró ninguna aceptación."],
    ["terms_422_already_own", "Los pasos solo pueden intentarse mientras el caso de cumplimiento está en progreso."],
  ])("%s: says so and reloads the case", async (key, message) => {
    route = (method, path) => {
      if (method === "POST" && path.endsWith("/attempt")) return sample(key);
      return caseRoutes(() => needsOwn(true))(method, path);
    };
    const view = await renderScreen();
    await view.findByTestId("terms-needs-own-acceptance");
    const caseReads = seen.filter((r) => r.path === "/compliance").length;
    autoConfirm();
    await act(async () => {
      fireEvent.press(view.getByText("Aceptar estos términos"));
    });
    expect(await view.findByText(message)).toBeTruthy();
    await waitFor(() => expect(seen.filter((r) => r.path === "/compliance").length).toBeGreaterThan(caseReads));
  });

  it("sponsor: requires_own_session wins over needs_own_acceptance; never the button", async () => {
    route = caseRoutes(() => needsOwn(true, { requires_own_session: true }));
    const view = await renderScreen({ id: "enrollment-a", name: "Persona Ficticia" });
    expect(await view.findByTestId("terms-requires-own-session")).toBeTruthy();
    expect(view.getByText(/Falta que Persona Ficticia acepte los términos desde su propia cuenta/)).toBeTruthy();
    expect(view.queryByText("Aceptar estos términos")).toBeNull();
    expect(seen.every((r) => r.method === "GET")).toBe(true);
  });
});
