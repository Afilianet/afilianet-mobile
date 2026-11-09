import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { NetworkSearchSection } from "../../components/network/NetworkSearchSection";
import { useMyPlacementChildren } from "../../hooks/useMyPlacementChildren";
import { useMySponsored } from "../../hooks/useMySponsored";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { AffiliateProfile, Organization } from "../../types/api";

/**
 * Server-side name search in «Mi red» against simulated HTTP: the real API
 * client, endpoints and hooks run; only global fetch is replaced. Contract:
 * docs/BUSQUEDA_RED_CONTRATO_ES.md.
 */
jest.setTimeout(30_000);

jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 15000, appEnv: "development" } }));

let mockUser: { id: string } | null = { id: "user-1" };
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: mockUser, status: mockUser ? "signedIn" : "signedOut" }) }));

type Json = Record<string, unknown>;
interface Pending {
  url: URL;
  resolve: (body: Json, status?: number) => void;
}
let requests: Pending[] = [];
let autoRespond: ((url: URL) => { body: Json; status?: number } | null) | null = null;

function respond(body: Json, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  requests = [];
  autoRespond = null;
  mockUser = { id: "user-1" };
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Promise((resolve) => {
      const auto = autoRespond?.(url);
      if (auto) resolve(respond(auto.body, auto.status) as unknown as Response);
      else requests.push({ url, resolve: (body, status = 200) => resolve(respond(body, status) as unknown as Response) });
    });
  }) as unknown as typeof fetch;
});

function person(id: string, first: string, last: string): AffiliateProfile {
  return {
    id,
    affiliate_code: `AF-${id}`,
    status: "active",
    user: { id: `u-${id}`, first_name: first, last_name: last },
    joined_at: null,
    activated_at: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function page(data: AffiliateProfile[], meta: Json) {
  return { data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length, ...meta } };
}

const ORG_A: Organization = {
  id: "org-a", name: "Acme", slug: "acme", legal_name: null, status: "active", timezone: "UTC", locale: "es", currency: "MXN",
  metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", my_role: "affiliate", my_membership_status: "active",
};
const ORG_B: Organization = { ...ORG_A, id: "org-b", name: "Beta" };

function orgValue(org: Organization): OrganizationContextValue {
  return { status: "ready", organizations: [ORG_A, ORG_B], activeOrganization: org, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
}

const onOpen = jest.fn();

/** Same wiring as network.tsx: one section per scope, keyed by account+organization. */
function Sections() {
  const sponsored = useMySponsored();
  const placement = useMyPlacementChildren();
  return (
    <>
      <NetworkSearchSection key={`s:${mockUser?.id}`} scope="sponsored" title="Referidos directos" helpText="" emptyTitle="Sin referidos" listQuery={sponsored} onOpen={onOpen} onLoadMorePress={jest.fn()} />
      <NetworkSearchSection key={`p:${mockUser?.id}`} scope="placement-children" title="Colocados debajo de ti" helpText="" emptyTitle="Sin colocados" listQuery={placement} onOpen={onOpen} onLoadMorePress={jest.fn()} />
    </>
  );
}

let queryClient: QueryClient;
function tree(org: Organization) {
  return (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(org)}>
        <Sections key={`${mockUser?.id}:${org.id}`} />
      </OrganizationContext.Provider>
    </QueryClientProvider>
  );
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Lists without search: the old API never returns meta.search. */
function oldApiLists(url: URL) {
  if (url.searchParams.has("search")) return null;
  if (url.pathname.endsWith("/me/sponsored")) return { body: page([person("s1", "Ana", "López"), person("s2", "Beto", "Ruiz")], {}) };
  if (url.pathname.endsWith("/me/placement-children")) return { body: page([person("p1", "Carla", "Díaz")], {}) };
  return null;
}

async function renderSections(org = ORG_A) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(tree(org));
  });
  await settle(10);
  return screen;
}

const SPONSORED_FIELD = "Buscar por nombre en referidos directos";
const PLACEMENT_FIELD = "Buscar por nombre en colocados debajo de ti";

async function search(screen: Awaited<ReturnType<typeof render>>, field: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(field), text);
  });
  await settle(400); // past the debounce
}

function searchRequests(path: string) {
  return requests.filter((request) => request.url.pathname.endsWith(path) && request.url.searchParams.has("search"));
}

afterEach(() => {
  // The organization-wide administrative roster is never used for this.
  for (const call of (global.fetch as jest.Mock).mock.calls) {
    expect(new URL(String(call[0])).pathname).not.toMatch(/\/api\/v1\/affiliates\/?$/);
  }
});

describe("Mi red: server-side name search", () => {
  it("old API: the plain list works; a search without meta.search is reported as unavailable, never as results, and clearing restores the list", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(screen.getByText("Beto Ruiz")).toBeTruthy();

    await search(screen, SPONSORED_FIELD, "Ana");
    const [request] = searchRequests("/me/sponsored");
    expect(request.url.searchParams.get("search")).toBe("Ana");
    // An old server ignores `search` and answers with the whole first page.
    await act(async () => request.resolve(page([person("s1", "Ana", "López"), person("s2", "Beto", "Ruiz")], {})));
    await settle(10);

    expect(screen.getByText(/La búsqueda no está disponible con la versión actual del servidor/)).toBeTruthy();
    expect(screen.queryByText("Beto Ruiz")).toBeNull();
    expect(screen.queryByText("Ana López")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getAllByText("Limpiar búsqueda")[1]);
    });
    await settle(400);
    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(screen.getByText("Beto Ruiz")).toBeTruthy();
    expect(screen.queryByText(/no está disponible/)).toBeNull();
  });

  it("confirmed filter: sends the trimmed name, shows only confirmed rows, and opens the right detail", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    await search(screen, SPONSORED_FIELD, "  Ana López  ");
    const [request] = searchRequests("/me/sponsored");
    expect(request.url.searchParams.get("search")).toBe("Ana López");
    expect(request.url.searchParams.get("page")).toBe("1");
    await act(async () => request.resolve(page([person("s9", "Ana", "López Pérez")], { search: "Ana López", total: 1 })));
    await settle(10);

    expect(screen.getByText("Ana López Pérez")).toBeTruthy();
    expect(screen.queryByText("Beto Ruiz")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Ana López Pérez"));
    });
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s9" }));
    // The other list keeps its own scope and was never searched.
    expect(searchRequests("/me/placement-children")).toHaveLength(0);
    expect(screen.getByText("Carla Díaz")).toBeTruthy();
  });

  it("a meta.search for a different term is not presented as results", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    await search(screen, SPONSORED_FIELD, "Ana");
    await act(async () => searchRequests("/me/sponsored")[0].resolve(page([person("s2", "Beto", "Ruiz")], { search: "Be" })));
    await settle(10);
    expect(screen.queryByText("Beto Ruiz")).toBeNull();
    expect(screen.getByText(/no está disponible/)).toBeTruthy();
  });

  it("a late answer for an older term never replaces the current results", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    await search(screen, SPONSORED_FIELD, "An");
    await search(screen, SPONSORED_FIELD, "Ana");
    const [older, current] = searchRequests("/me/sponsored");
    expect(older.url.searchParams.get("search")).toBe("An");
    expect(current.url.searchParams.get("search")).toBe("Ana");

    await act(async () => current.resolve(page([person("s1", "Ana", "López")], { search: "Ana" })));
    await settle(10);
    await act(async () => older.resolve(page([person("s3", "Andrés", "Gil"), person("s1", "Ana", "López")], { search: "An" })));
    await settle(10);

    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(screen.queryByText("Andrés Gil")).toBeNull();
  });

  it("paginates the filtered results; a page without the confirmation is never appended (the search is reported unavailable)", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    await search(screen, SPONSORED_FIELD, "Ana");
    await act(async () =>
      searchRequests("/me/sponsored")[0].resolve(page([person("s1", "Ana", "López")], { search: "Ana", current_page: 1, last_page: 3, total: 3 })),
    );
    await settle(10);

    await act(async () => {
      fireEvent.press(screen.getByText("Cargar más"));
    });
    await settle(10);
    const second = searchRequests("/me/sponsored")[1];
    expect(second.url.searchParams.get("page")).toBe("2");
    expect(second.url.searchParams.get("search")).toBe("Ana");
    await act(async () => second.resolve(page([person("s4", "Ana", "Mora")], { search: "Ana", current_page: 2, last_page: 3, total: 3 })));
    await settle(10);
    expect(screen.getByText("Ana Mora")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Cargar más"));
    });
    await settle(10);
    const third = searchRequests("/me/sponsored")[2];
    await act(async () => third.resolve(page([person("s5", "Zoe", "Unfiltered")], { current_page: 3, last_page: 3 })));
    await settle(10);
    // The server stopped confirming the filter mid-pagination: nothing is
    // mixed in, and the whole search is reported as unavailable.
    expect(screen.queryByText("Zoe Unfiltered")).toBeNull();
    expect(screen.getByText(/no está disponible/)).toBeTruthy();
  });

  it("states: too short (no request), no results, and a server error with retry", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections();
    await search(screen, PLACEMENT_FIELD, "C");
    expect(screen.getByText("Escribe al menos 2 letras para buscar.")).toBeTruthy();
    expect(searchRequests("/me/placement-children")).toHaveLength(0);
    expect(screen.getByText("Carla Díaz")).toBeTruthy();

    await search(screen, PLACEMENT_FIELD, "Zz");
    await act(async () => searchRequests("/me/placement-children")[0].resolve(page([], { search: "Zz", total: 0 })));
    await settle(10);
    expect(screen.getByText("Nadie en esta lista coincide con «Zz».")).toBeTruthy();

    // A failing server (the app's usual policy retries twice before showing the error).
    autoRespond = (url) => (url.searchParams.get("search") === "Car" ? { body: { message: "Server Error" }, status: 500 } : oldApiLists(url));
    await search(screen, PLACEMENT_FIELD, "Car");
    await settle(4000);
    expect(screen.queryByText("Carla Díaz")).toBeNull();
    expect(screen.getByText("Intenta de nuevo")).toBeTruthy();
  });

  it("switching organization or account clears the text and never shows the previous one's results", async () => {
    autoRespond = oldApiLists;
    const screen = await renderSections(ORG_A);
    await search(screen, SPONSORED_FIELD, "Ana");
    const fromOrgA = searchRequests("/me/sponsored")[0];

    // The organization changes while that search is still in flight.
    await act(async () => {
      screen.rerender(tree(ORG_B));
    });
    await settle(10);
    expect(screen.getByLabelText(SPONSORED_FIELD).props.value).toBe("");
    await act(async () => fromOrgA.resolve(page([person("s1", "Ana", "López")], { search: "Ana" })));
    await settle(10);
    expect(screen.queryByText(/coincide/)).toBeNull();
    // Org B's own plain list is what is shown.
    expect(screen.getByText("Beto Ruiz")).toBeTruthy();

    await search(screen, SPONSORED_FIELD, "Ana");
    mockUser = { id: "user-2" };
    await act(async () => {
      screen.rerender(tree(ORG_B));
    });
    await settle(10);
    expect(screen.getByLabelText(SPONSORED_FIELD).props.value).toBe("");
    expect(queryKeysWithSearch()).toEqual(
      expect.arrayContaining([
        ["affiliate", "sponsored", "me", "org-a", "user-1", "search", "Ana"],
        ["affiliate", "sponsored", "me", "org-b", "user-1", "search", "Ana"],
      ]),
    );
  });
});

function queryKeysWithSearch() {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey as unknown[])
    .filter((key) => key.includes("search"));
}
