import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor as rawWaitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Organization } from "../../types/api";
import NotificationsScreen from "../../app/notifications";

/**
 * The bell's inbox with the REAL endpoints, API client and paginated hook
 * (production retry policy included); only global fetch is simulated. It
 * tells apart what the screen shows for an HTTP 5xx, a network failure and
 * an unreadable 200, and pins the request the inbox actually makes.
 *
 * Context (2026-10-20): deployed API 1a3b948 answers 500 to
 * GET /api/v1/notifications whenever the page holds a `survey_assigned`
 * notification -- NotificationCopy::render() has no match arm for it.
 */
jest.setTimeout(30_000);
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://staging-api.test", apiTimeoutMs: 5000, appEnv: "staging" } }));
jest.mock("../../config/release", () => ({ releaseFeatures: { commerce: true } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));

// The app's retries (2, with a shortened delay) take longer than waitFor's 1 s default.
const waitFor = (expectation: () => unknown) => rawWaitFor(expectation, { timeout: 8000 });

const ORG_A: Organization = {
  id: "org-a",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "es",
  currency: "MXN",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "affiliate",
  my_membership_status: "active",
};
const ORG_B: Organization = { ...ORG_A, id: "org-b", name: "Beta" };

const orgValue = (organization: Organization): OrganizationContextValue => ({
  status: "ready",
  organizations: [ORG_A, ORG_B],
  activeOrganization: organization,
  error: null,
  selectOrganization: jest.fn(),
  refresh: jest.fn(),
});

const surveyAssigned = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "survey_assigned",
  title: "Nueva encuesta",
  body: "Tienes una encuesta nueva.",
  payload: { screen: "surveys", organization_id: "org-a", survey_id: "s", version_id: "v", title: "Nueva encuesta" },
  read_at: null,
  created_at: "2026-10-20T10:00:00Z",
};
const commission = { ...surveyAssigned, id: "22222222-2222-4222-8222-222222222222", type: "commission_earned", title: "Comisión ganada", body: "Ganaste 25.00 MXN.", payload: { screen: "commissions" } };

type Reply = { status: number; body?: unknown; raw?: string } | "network";
let inbox: Record<string, Reply[]> = {};
let organizationId = "org-a";
const requests: { url: string; organization: string | undefined; authorized: boolean }[] = [];
const originalFetch = global.fetch;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function serve(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = (init.headers ?? {}) as Record<string, string>;
  if (url.endsWith("/api/v1/notifications/unread-count")) return Promise.resolve(json(200, { data: { count: 0 } }));
  requests.push({ url, organization: headers["X-Organization-ID"], authorized: Boolean(headers.Authorization) });
  const queue = inbox[headers["X-Organization-ID"] ?? ""] ?? [];
  const reply = queue.length > 1 ? queue.shift()! : queue[0];
  if (!reply || reply === "network") return Promise.reject(new TypeError("Network request failed"));
  return Promise.resolve(reply.raw !== undefined ? new Response(reply.raw, { status: reply.status }) : json(reply.status, reply.body));
}

const page = (data: unknown[]) => ({ data, links: {}, meta: { current_page: 1, last_page: 1, per_page: 25, total: data.length } });
const SERVER_ERROR: Reply = { status: 500, body: { message: "Server Error" } };

let queryClient: QueryClient;

async function renderInbox(organization: Organization = ORG_A) {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue(organization)}>
          <NotificationsScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return screen;
}

beforeEach(() => {
  inbox = {};
  organizationId = "org-a";
  requests.length = 0;
  // The app's own retry policy runs; only its backoff is shortened.
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  global.fetch = jest.fn(serve) as typeof fetch;
  configureApiClient({ getToken: () => "session-token", getOrganizationId: () => organizationId });
});
afterEach(() => {
  queryClient.clear();
  global.fetch = originalFetch;
  configureApiClient({ getToken: () => null, getOrganizationId: () => null });
});

describe("Notification inbox over the real API client", () => {
  it("asks GET /api/v1/notifications?per_page=25&page=1 with the session and the active organization, and lists what comes back", async () => {
    inbox["org-a"] = [{ status: 200, body: page([surveyAssigned, commission]) }];
    const screen = await renderInbox();

    await waitFor(() => expect(screen.getByText("Comisión ganada")).toBeTruthy());
    // Once the API serializes it, a survey notification this app has no icon for still shows, never breaks the list.
    expect(screen.getByText("Nueva encuesta")).toBeTruthy();
    expect(requests).toEqual([{ url: "https://staging-api.test/api/v1/notifications?per_page=25&page=1", organization: "org-a", authorized: true }]);
  });

  it("an empty inbox says so", async () => {
    inbox["org-a"] = [{ status: 200, body: page([]) }];
    const screen = await renderInbox();
    await waitFor(() => expect(screen.getByText("Aún no hay notificaciones")).toBeTruthy());
  });

  it("a persistent HTTP 500 (what API 1a3b948 returns) is the red «Algo salió mal de nuestro lado…» after the app's two retries; «Intenta de nuevo» asks again and recovers", async () => {
    inbox["org-a"] = [SERVER_ERROR, SERVER_ERROR, SERVER_ERROR, { status: 200, body: page([commission]) }];
    const screen = await renderInbox();

    await waitFor(() => expect(screen.getByText("Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.")).toBeTruthy());
    expect(requests).toHaveLength(3);
    expect(screen.getByText("Intenta de nuevo")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Intenta de nuevo"));
    });
    await waitFor(() => expect(screen.getByText("Comisión ganada")).toBeTruthy());
    expect(requests).toHaveLength(4);
    expect(screen.queryByText(/Algo salió mal/)).toBeNull();
  });

  it("is told apart from a network failure («No tienes conexión…», not «Algo salió mal de nuestro lado»)", async () => {
    inbox["org-a"] = ["network"];
    const offline = await renderInbox();
    await waitFor(() => expect(offline.getByText("No tienes conexión. Revisa tu conexión e inténtalo de nuevo.")).toBeTruthy());
    expect(offline.queryByText(/Algo salió mal/)).toBeNull();
    expect(offline.getByText("Intenta de nuevo")).toBeTruthy();
  });

  it("an unreadable 200 (not the paginator, e.g. a proxy page) is a failed load with its retry, never a broken screen nor «Algo salió mal de nuestro lado»", async () => {
    inbox["org-a"] = [{ status: 200, raw: "<html>proxy page</html>" }];
    const unreadable = await renderInbox();
    await waitFor(() => expect(unreadable.getByText("Intenta de nuevo")).toBeTruthy());
    expect(unreadable.getByText("No pudimos cargar esto.")).toBeTruthy();
    expect(unreadable.queryByText(/Algo salió mal/)).toBeNull();
  });

  it("after switching organization it asks with the new organization and never shows the previous one's list or error", async () => {
    inbox["org-a"] = [SERVER_ERROR];
    inbox["org-b"] = [{ status: 200, body: page([commission]) }];
    const screen = await renderInbox(ORG_A);
    await waitFor(() => expect(screen.getByText(/Algo salió mal/)).toBeTruthy());

    organizationId = "org-b";
    await act(async () => {
      screen.rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue(ORG_B)}>
            <NotificationsScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    await waitFor(() => expect(screen.getByText("Comisión ganada")).toBeTruthy());
    expect(screen.queryByText(/Algo salió mal/)).toBeNull();
    expect(requests.at(-1)).toEqual({ url: "https://staging-api.test/api/v1/notifications?per_page=25&page=1", organization: "org-b", authorized: true });
  });
});
