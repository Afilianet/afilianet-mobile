import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor as rawWaitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { queryClient } from "../../api/queryClient";
import { configureApiClient } from "../../api/client";
import { OrganizationProvider } from "../../state/OrganizationProvider";
import { OrganizationContext, useOrganization, type OrganizationContextValue } from "../../state/OrganizationContext";
import { identityCaptureAvailable } from "../../state/membership";
import type { Organization } from "../../types/api";
import ComplianceScreen from "../../app/compliance";

/**
 * API #86 (feat/kyc-capture-control @ 825f9e5, docs/identity/KYC_CAPTURE_CONTROL.md)
 * with the REAL compliance screen, hooks, API client and OrganizationProvider;
 * only fetch is simulated, as one API that answers per X-Organization-ID:
 * - `identity_verification_available` per organization in GET /me/organizations;
 * - 503 {reason: "kyc_unavailable"} from the capture routes when capture is off.
 * Every request is recorded, so the tests assert what is NOT requested.
 */
jest.setTimeout(30_000);
const waitFor = (expectation: () => unknown) => rawWaitFor(expectation, { timeout: 5000 });

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://staging-api.test", apiTimeoutMs: 5000, appEnv: "staging" } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock("../../auth/AuthContext", () => {
  const auth = { status: "signedIn", user: { id: "user-1", first_name: "Ana", last_name: "Pérez" } };
  return { useAuth: () => auth };
});
jest.mock("../../services/storage", () => {
  const values = new Map<string, string>();
  return {
    secureStorage: {
      get: jest.fn(async (key: string) => values.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => void values.set(key, value)),
      remove: jest.fn(async (key: string) => void values.delete(key)),
    },
  };
});
jest.mock("../../services/offlineSession", () => ({
  restoreOfflineOrganizations: jest.fn(async () => null),
  saveOfflineOrganizations: jest.fn(async () => undefined),
}));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

const base = { slug: "s", legal_name: null, status: "active", timezone: "America/Mexico_City", locale: "es", currency: "MXN", metadata: null, created_at: "x", updated_at: "x", my_role: "affiliate", my_membership_status: "active", has_affiliate_profile: true };
const OFF = { ...base, id: "org-off", name: "Captura apagada", identity_verification_available: false } as Organization;
const ON = { ...base, id: "org-on", name: "Captura encendida", identity_verification_available: true } as Organization;
const OLD = { ...base, id: "org-old", name: "API anterior" } as Organization;

const CASE = {
  id: "case-1", status: "in_progress", current_step: "identity_document", risk_level: null, started_at: "2026-10-01T00:00:00Z",
  submitted_at: null, reviewed_at: null, approved_at: null, rejected_at: null, expires_at: null, rejection_reason: null, created_at: "2026-10-01T00:00:00Z",
};
const step = (id: string, step_type: string, status: string) => ({
  id, step_type, status, provider: null, score: null, attempt_count: 0, completed_at: status === "passed" ? "2026-10-02T00:00:00Z" : null,
  created_at: "2026-10-01T00:00:00Z", configured_provider: "afilianet", provider_actionable: true, provider_unavailable_reason: null,
});
const STEPS = [step("s-info", "identity_information", "passed"), step("s-doc", "identity_document", "pending"), step("s-live", "biometric_liveness", "pending")];
const KYC_UNAVAILABLE = { message: "La verificación de identidad no está disponible en esta organización.", reason: "kyc_unavailable" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let organizationList: Organization[];
/** Organizations whose capture routes refuse, whatever the list said when the app loaded it. */
let captureOffOnServer: Set<string>;
/** Organizations with a case on the server. */
let withCase: Set<string>;
let holdStart: { release: () => void } | null;
const requests: { method: string; path: string; organization: string | undefined }[] = [];

function serve(url: string, init: RequestInit = {}): Promise<Response> {
  const organization = ((init.headers ?? {}) as Record<string, string>)["X-Organization-ID"];
  const method = init.method ?? "GET";
  const path = url.replace("https://staging-api.test", "");
  requests.push({ method, path, organization });
  if (path === "/api/v1/me/organizations") return Promise.resolve(json(200, { data: organizationList }));
  if (path === "/api/v1/affiliates/me") return Promise.resolve(json(200, { data: { id: "aff-1", affiliate_code: "ANA1", status: "active", joined_at: "x", activated_at: "x", metadata: null, created_at: "x" } }));
  if (path === "/api/v1/compliance") {
    return Promise.resolve(withCase.has(organization ?? "") ? json(200, { data: { ...CASE, steps: STEPS } }) : json(404, { message: "No encontrado." }));
  }
  if (path === "/api/v1/compliance/steps") return Promise.resolve(json(200, { data: STEPS }));
  if (path === "/api/v1/compliance/start" && method === "POST") {
    const answer = () => (captureOffOnServer.has(organization ?? "") ? json(503, KYC_UNAVAILABLE) : json(201, { data: { ...CASE, steps: STEPS } }));
    if (!holdStart) return Promise.resolve(answer());
    return new Promise((resolve) => { holdStart = { release: () => resolve(answer()) }; });
  }
  return Promise.resolve(json(404, { message: "No encontrado." }));
}

const posts = () => requests.filter((request) => request.method !== "GET");
const originalFetch = global.fetch;
let org: OrganizationContextValue;

function Capture() {
  const value = useOrganization();
  useEffect(() => { org = value; });
  return null;
}

/** Real OrganizationProvider: the list comes from the simulated GET /me/organizations. */
async function showWithProvider() {
  let rendered!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    rendered = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationProvider>
          <Capture />
          <ComplianceScreen />
        </OrganizationProvider>
      </QueryClientProvider>,
    );
  });
  await waitFor(() => expect(org.status).toBe("ready"));
  return rendered;
}

async function select(organizationId: string) {
  await act(async () => { await org.selectOrganization(organizationId); });
}

beforeEach(() => {
  jest.clearAllMocks();
  requests.length = 0;
  organizationList = [OFF, ON, OLD];
  captureOffOnServer = new Set(["org-off"]);
  withCase = new Set();
  holdStart = null;
  global.fetch = jest.fn(serve) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  queryClient.clear();
  configureApiClient({ getOrganizationId: () => null, onKycUnavailable: () => undefined });
});

describe("identityCaptureAvailable", () => {
  it("only an explicit false turns capture off; a missing field is unknown", () => {
    expect(identityCaptureAvailable({ identity_verification_available: false })).toBe(false);
    expect(identityCaptureAvailable({ identity_verification_available: true })).toBe(true);
    expect(identityCaptureAvailable({})).toBe(true);
    expect(identityCaptureAvailable(null)).toBe(true);
  });
});

describe("Verification screen with capture control (API #86)", () => {
  it("explicit false and no case: explains it, offers no start and never calls a capture route", async () => {
    const screen = await showWithProvider();
    await select("org-off");

    await waitFor(() => expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy());
    expect(screen.getByText("Verificación de identidad no disponible en esta organización")).toBeTruthy();
    expect(screen.queryByText("Comenzar verificación")).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("missing field: unknown, not false -- the start stays offered as before", async () => {
    const screen = await showWithProvider();
    await select("org-old");

    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());
    expect(screen.queryByTestId("kyc-capture-unavailable")).toBeNull();
  });

  it("existing case with capture off: status and passed steps stay readable; no capture flow mounts, also after a manual refresh", async () => {
    withCase = new Set(["org-off", "org-on"]);
    const screen = await showWithProvider();
    await select("org-on");
    // Baseline: with capture on, the pending document step offers its capture flow.
    await waitFor(() => expect(screen.getByText("INE mexicana")).toBeTruthy());

    await select("org-off");
    await waitFor(() => expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy());
    expect(screen.getByText("En progreso")).toBeTruthy();
    expect(screen.getByText("Información de identidad")).toBeTruthy();
    expect(screen.queryByText("INE mexicana")).toBeNull();

    const before = requests.length;
    await act(async () => {
      await screen.getByTestId("compliance-scroll").props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
    expect(requests.slice(before).every((request) => request.method === "GET")).toBe(true);
    expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy();
    expect(screen.queryByText("INE mexicana")).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("switching organization re-evaluates it both ways", async () => {
    const screen = await showWithProvider();
    await select("org-off");
    await waitFor(() => expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy());

    await select("org-on");
    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());
    expect(screen.queryByTestId("kyc-capture-unavailable")).toBeNull();

    await select("org-off");
    await waitFor(() => expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy());
    expect(screen.queryByText("Comenzar verificación")).toBeNull();
  });

  it("server refusal (list said nothing): no apparent success, and capture stops being offered in that organization only", async () => {
    captureOffOnServer = new Set(["org-old"]);
    const screen = await showWithProvider();
    await select("org-old");
    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());

    await act(async () => { fireEvent.press(screen.getByText("Comenzar verificación")); });

    await waitFor(() => expect(screen.getByTestId("kyc-capture-unavailable")).toBeTruthy());
    expect(posts()).toEqual([{ method: "POST", path: "/api/v1/compliance/start", organization: "org-old" }]);
    expect(screen.queryByText("En progreso")).toBeNull();
    expect(screen.queryByText("Comenzar verificación")).toBeNull();
    expect(org.organizations.find((item) => item.id === "org-old")?.identity_verification_available).toBe(false);
    expect(org.organizations.find((item) => item.id === "org-on")?.identity_verification_available).toBe(true);

    // The next list from the server is authoritative again (e.g. capture turned back on).
    captureOffOnServer = new Set();
    await act(async () => { await org.refresh(); });
    await select("org-old");
    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());
  });

  it("late refusal after switching organization: recorded for the organization it was sent for, never the new active one", async () => {
    captureOffOnServer = new Set(["org-old"]);
    holdStart = { release: () => undefined };
    const screen = await showWithProvider();
    await select("org-old");
    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByText("Comenzar verificación")); });
    await waitFor(() => expect(posts()).toHaveLength(1));

    await select("org-on");
    await act(async () => { holdStart!.release(); });

    await waitFor(() => expect(org.organizations.find((item) => item.id === "org-old")?.identity_verification_available).toBe(false));
    expect(org.activeOrganization?.id).toBe("org-on");
    expect(org.activeOrganization?.identity_verification_available).toBe(true);
    await waitFor(() => expect(screen.getByText("Comenzar verificación")).toBeTruthy());
    expect(screen.queryByTestId("kyc-capture-unavailable")).toBeNull();
  });
});

describe("Step card defence in depth", () => {
  it("a static context with false never mounts a pending step's capture component", async () => {
    withCase = new Set(["org-off"]);
    configureApiClient({ getOrganizationId: () => "org-off" });
    const value = { status: "ready", organizations: [OFF], activeOrganization: OFF, error: null, selectOrganization: jest.fn(), refresh: jest.fn() } as unknown as OrganizationContextValue;
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={value}><ComplianceScreen /></OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText("En progreso")).toBeTruthy());
    expect(screen.queryByText("INE mexicana")).toBeNull();
    expect(requests.some((request) => /document-result|liveness-result/.test(request.path))).toBe(false);
  });
});
