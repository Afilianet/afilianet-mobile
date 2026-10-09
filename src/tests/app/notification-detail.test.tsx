import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { configureApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";
import { fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Notification, Organization, PaginatedResponse } from "../../types/api";
import NotificationDetailScreen from "../../app/notification/[id]";
jest.mock("../../config/release", () => ({ releaseFeatures: { commerce: true } }));
// The first render pays the screen's cold module cost; on slow machines that alone can pass Jest's 10s default.
jest.setTimeout(30_000);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockId = "notif-1";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: mockId }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchNotifications: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const mockedFetchNotifications = fetchNotifications as jest.Mock;
const mockedFetchUnreadNotificationCount = fetchUnreadNotificationCount as jest.Mock;
const mockedMarkNotificationRead = markNotificationRead as jest.Mock;
const mockedMarkAllNotificationsRead = markAllNotificationsRead as jest.Mock;

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

// What the global API client would send right now (Authorization / X-Organization-ID).
const mockSession: { token: string | null; orgId: string | null } = { token: "token-a", orgId: "org-a" };

function orgValue(org: Organization = ORG_A): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG_A, ORG_B],
    activeOrganization: org,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
  };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    type: "compliance_action_required",
    title: "Acción requerida",
    body: "Uno de tus pasos de verificación necesita otro intento.",
    payload: { screen: "compliance", case_id: "case-1" },
    read_at: null,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function page(data: Notification[], currentPage = 1, lastPage = 1): PaginatedResponse<Notification> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 100, total: data.length } };
}

let queryClient: QueryClient;

function detailTree(org: Organization = ORG_A) {
  return (
    <QueryClientProvider client={queryClient}>
      <OrganizationContext.Provider value={orgValue(org)}>
        <NotificationDetailScreen />
      </OrganizationContext.Provider>
    </QueryClientProvider>
  );
}

async function renderDetail(org: Organization = ORG_A) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(detailTree(org));
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockId = "notif-1";
  mockSession.token = "token-a";
  mockSession.orgId = "org-a";
  configureApiClient({ getToken: () => mockSession.token, getOrganizationId: () => mockSession.orgId });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  mockedFetchNotifications.mockResolvedValue(page([notification(), notification({ id: "notif-2", title: "Otra" })]));
  mockedFetchUnreadNotificationCount.mockResolvedValue(2);
  mockedMarkNotificationRead.mockResolvedValue(notification({ read_at: "2026-01-01T10:05:00Z" }));
  mockedMarkAllNotificationsRead.mockResolvedValue(undefined);
});

afterEach(() => {
  queryClient.clear();
});

describe("Notification detail", () => {
  it("shows the server's title, body and a whitelisted action", async () => {
    const { findByText, getByText } = await renderDetail();

    expect(await findByText("Acción requerida")).toBeTruthy();
    expect(getByText("Uno de tus pasos de verificación necesita otro intento.")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText("Ir a Verificación"));
    });
    expect(mockPush).toHaveBeenCalledWith("/compliance");
  });

  it("marks only the opened notification read, exactly once, never the whole inbox", async () => {
    const { findByText } = await renderDetail();
    await findByText("Acción requerida");

    await waitFor(() => expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(1));
    expect(mockedMarkNotificationRead.mock.calls[0][0]).toBe("notif-1");
    expect(mockedMarkAllNotificationsRead).not.toHaveBeenCalled();

    // The read invalidates the feed; a refetch that still says unread must not re-fire it.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(1);
  });

  it("does not call the read endpoint again for an already-read notification", async () => {
    mockedFetchNotifications.mockResolvedValue(page([notification({ read_at: "2026-01-01T09:00:00Z" })]));
    const { findByText } = await renderDetail();
    await findByText("Acción requerida");

    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("still shows the notification when the read call fails, and does not retry in a loop", async () => {
    mockedMarkNotificationRead.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderDetail();

    expect(await findByText("Acción requerida")).toBeTruthy();
    // The hook refreshes the feed on failure; the refetched (still unread) row must not re-fire the read.
    await waitFor(() => expect(mockedFetchNotifications.mock.calls.length).toBeGreaterThan(1));
    expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(1);
  });

  it("offers no action when payload.screen is missing or unrecognized -- fails safe", async () => {
    mockedFetchNotifications.mockResolvedValue(page([notification({ payload: { screen: "some-other-app://danger" } })]));
    const { findByText, queryByText } = await renderDetail();
    await findByText("Acción requerida");

    expect(queryByText("Ver más")).toBeNull();
    expect(queryByText("Ir a Verificación")).toBeNull();
  });

  it("shows a safe not-found state, without marking anything read, for an unknown id", async () => {
    mockId = "missing";
    const { findByText, getByText } = await renderDetail();

    expect(await findByText("No encontramos esta notificación")).toBeTruthy();
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByText("Volver a notificaciones"));
    });
    expect(mockReplace).toHaveBeenCalledWith("/notifications");
  });
});

describe("Notification detail: resolving without the inbox", () => {
  it("finds a notification beyond the first page, without the inbox ever having loaded it", async () => {
    mockId = "notif-150";
    mockedFetchNotifications.mockImplementation((pageNumber: number) =>
      Promise.resolve(
        pageNumber === 1
          ? page([notification({ id: "notif-1" })], 1, 2)
          : page([notification({ id: "notif-150", title: "Pago realizado" })], 2, 2),
      ),
    );
    const { findByText } = await renderDetail();

    expect(await findByText("Pago realizado")).toBeTruthy();
    expect(mockedFetchNotifications).toHaveBeenCalledWith(1, 100);
    expect(mockedFetchNotifications).toHaveBeenCalledWith(2, 100);
    await waitFor(() => expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(1));
    expect(mockedMarkNotificationRead.mock.calls[0][0]).toBe("notif-150");
  });

  it("shows a retryable error -- never 'not found' -- when the request fails", async () => {
    mockedFetchNotifications.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText, getByText, queryByText } = await renderDetail();

    expect(await findByText("No se pudo cargar")).toBeTruthy();
    expect(queryByText("No encontramos esta notificación")).toBeNull();
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();

    mockedFetchNotifications.mockResolvedValue(page([notification()]));
    await act(async () => {
      fireEvent.press(getByText("Intenta de nuevo"));
    });
    expect(await findByText("Acción requerida")).toBeTruthy();
  });

  it("reports 'not found' only after reading through the last page", async () => {
    mockId = "missing";
    mockedFetchNotifications.mockImplementation((pageNumber: number) =>
      Promise.resolve(page([notification({ id: `notif-p${pageNumber}` })], pageNumber, 3)),
    );
    const { findByText } = await renderDetail();

    expect(await findByText("No encontramos esta notificación")).toBeTruthy();
    expect(mockedFetchNotifications).toHaveBeenCalledTimes(3);
  });

  it("says it could not locate the notification, not that it does not exist, when the search limit is reached", async () => {
    mockId = "missing";
    mockedFetchNotifications.mockImplementation((pageNumber: number) =>
      Promise.resolve(page([notification({ id: `notif-p${pageNumber}` })], pageNumber, 500)),
    );
    const { findByText, queryByText } = await renderDetail();

    expect(await findByText("No pudimos ubicar esta notificación")).toBeTruthy();
    expect(queryByText("No encontramos esta notificación")).toBeNull();
    expect(mockedFetchNotifications).toHaveBeenCalledTimes(20);
  });
});

describe("Notification detail: bound to the session it started in", () => {
  type Call = { org: string | null; token: string | null; page: number };

  function controlledPages() {
    const calls: Call[] = [];
    const pending: { resolve: (value: PaginatedResponse<Notification>) => void; reject: (error: unknown) => void }[] = [];
    mockedFetchNotifications.mockImplementation((pageNumber: number) => {
      calls.push({ org: mockSession.orgId, token: mockSession.token, page: pageNumber });
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    });
    return { calls, pending };
  }

  function detailState(org: string, id: string) {
    return queryClient.getQueryState(["notifications", "mine", org, "detail", id]);
  }

  it("stops when the organization changes while a page is pending: no next page in the new context, nothing stored under the old key", async () => {
    mockId = "notif-150";
    const { calls, pending } = controlledPages();
    const screen = await renderDetail(ORG_A);
    await waitFor(() => expect(calls).toHaveLength(1));

    mockSession.orgId = "org-b";
    await act(async () => {
      screen.rerender(detailTree(ORG_B));
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => {
      // Org A's page 1 (not the last page) lands after the switch.
      pending[0].resolve(page([notification({ id: "notif-a-1" })], 1, 2));
      // Org B's own search: page 1 is its last page.
      pending[1].resolve(page([notification({ id: "notif-b-1", title: "De Beta" })], 1, 1));
    });

    expect(await screen.findByText("No encontramos esta notificación")).toBeTruthy();
    expect(calls).toEqual([
      { org: "org-a", token: "token-a", page: 1 },
      { org: "org-b", token: "token-a", page: 1 },
    ]);
    const stale = detailState("org-a", "notif-150");
    expect(stale?.data).toBeUndefined();
    expect(stale?.error).toBeNull();
    expect(stale?.fetchStatus).toBe("idle");
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("never shows, or marks read, a notification whose page arrives after sign-out", async () => {
    const { calls, pending } = controlledPages();
    const screen = await renderDetail();
    await waitFor(() => expect(calls).toHaveLength(1));

    mockSession.token = null;
    await act(async () => {
      pending[0].resolve(page([notification()]));
    });

    expect(screen.queryByText("Acción requerida")).toBeNull();
    expect(screen.queryByText("No encontramos esta notificación")).toBeNull();
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();
    const stale = detailState("org-a", "notif-1");
    expect(stale?.data).toBeUndefined();
    expect(stale?.error).toBeNull();
    expect(stale?.fetchStatus).toBe("idle");
  });

  it("does not request the next page under another account signed into the same organization", async () => {
    mockId = "notif-150";
    const { calls, pending } = controlledPages();
    const screen = await renderDetail();
    await waitFor(() => expect(calls).toHaveLength(1));

    mockSession.token = "token-b";
    await act(async () => {
      pending[0].resolve(page([notification({ id: "notif-a-1" })], 1, 2));
    });

    expect(calls).toEqual([{ org: "org-a", token: "token-a", page: 1 }]);
    expect(screen.queryByText("No encontramos esta notificación")).toBeNull();
    expect(screen.queryByText("No pudimos ubicar esta notificación")).toBeNull();
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("does not surface an error caused by the session ending mid-request", async () => {
    const { calls, pending } = controlledPages();
    const screen = await renderDetail();
    await waitFor(() => expect(calls).toHaveLength(1));

    mockSession.token = null;
    await act(async () => {
      pending[0].reject(new ApiError("unauthorized", "Unauthenticated.", 401));
    });

    expect(screen.queryByText("No se pudo cargar")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(detailState("org-a", "notif-1")?.error).toBeNull();
  });
});
