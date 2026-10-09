import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Notification, Organization, PaginatedResponse } from "../../types/api";
import NotificationDetailScreen from "../../app/notification/[id]";
jest.mock("../../config/release", () => ({ releaseFeatures: { commerce: true } }));

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

function orgValue(): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG_A],
    activeOrganization: ORG_A,
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

async function renderDetail() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={orgValue()}>
          <NotificationDetailScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockId = "notif-1";
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
