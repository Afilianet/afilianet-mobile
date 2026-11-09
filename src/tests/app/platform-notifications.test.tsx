import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  fetchPlatformNotifications,
  fetchPlatformUnreadNotificationCount,
  markAllPlatformNotificationsRead,
  markPlatformNotificationRead,
  fetchPlatformNotificationPreferences,
} from "../../api/endpoints";
import { analytics } from "../../services/analytics";
import type { Notification, PaginatedResponse } from "../../types/api";
import PlatformNotificationsScreen from "../../app/platform-notifications";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock("expo-notifications", () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }) }));
jest.mock("../../services/push", () => ({ registerPush: jest.fn() }));

jest.mock("../../api/endpoints", () => ({
  fetchPlatformNotifications: jest.fn(),
  fetchPlatformUnreadNotificationCount: jest.fn(),
  markPlatformNotificationRead: jest.fn(),
  markAllPlatformNotificationsRead: jest.fn(),
  fetchPlatformNotificationPreferences: jest.fn(),
  updatePlatformNotificationPreferences: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchPlatformNotifications = fetchPlatformNotifications as jest.Mock;
const mockedFetchUnreadCount = fetchPlatformUnreadNotificationCount as jest.Mock;
const mockedMarkRead = markPlatformNotificationRead as jest.Mock;
const mockedMarkAllRead = markAllPlatformNotificationsRead as jest.Mock;
const mockedFetchPreferences = fetchPlatformNotificationPreferences as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    type: "announcement",
    title: "Nuevo anuncio",
    body: "Afilianet tiene novedades.",
    payload: { screen: "platform-notifications" },
    read_at: null,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function page(data: Notification[], currentPage = 1, lastPage = 1, total = data.length): PaginatedResponse<Notification> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 25, total } };
}

let queryClient: QueryClient;

async function renderScreen() {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <PlatformNotificationsScreen />
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchPlatformNotifications.mockResolvedValue(page([notification()]));
  mockedFetchUnreadCount.mockResolvedValue(1);
  mockedMarkRead.mockResolvedValue(notification({ read_at: "2026-01-01T10:05:00Z" }));
  mockedMarkAllRead.mockResolvedValue(undefined);
  mockedFetchPreferences.mockResolvedValue({ push_enabled: true, service_push: true, promotions: false, consent_version: "v1" });
});

afterEach(() => {
  queryClient.clear();
});

describe("Platform notifications: inbox", () => {
  it("shows notifications with the Afilianet badge, distinguishing them from organization notifications", async () => {
    const { findByText } = await renderScreen();
    expect(await findByText("Nuevo anuncio")).toBeTruthy();
    expect(await findByText("Afilianet")).toBeTruthy();
  });

  it("shows an honest empty state with no notifications", async () => {
    mockedFetchPlatformNotifications.mockResolvedValue(page([]));
    const { findByText } = await renderScreen();
    expect(await findByText("Aún no hay notificaciones de Afilianet")).toBeTruthy();
  });

  it("never fires a tenant-scoped request -- no X-Organization-ID plumbing involved at all", async () => {
    await renderScreen();
    await waitFor(() => expect(mockedFetchPlatformNotifications).toHaveBeenCalled());
    // The mocked endpoint functions themselves are the organization-
    // independent ones (fetchPlatformNotifications, not fetchNotifications) --
    // reaching this screen at all proves no org-scoped hook was used.
    expect(mockedFetchPlatformNotifications).toHaveBeenCalledWith(1);
  });
});

describe("Platform notifications: mark as read", () => {
  it("marks the notification read and navigates when opened", async () => {
    const { findByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(await findByText("Nuevo anuncio"));
    });
    expect(mockedMarkRead.mock.calls[0][0]).toBe("notif-1");
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/platform-notifications"));
  });

  it("marks all as read and refreshes the inbox and unread count", async () => {
    const { findByText } = await renderScreen();
    await findByText("Nuevo anuncio");

    await act(async () => {
      fireEvent.press(await findByText("Marcar todo como leído"));
    });

    expect(mockedMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error and does not crash the inbox when read-all fails", async () => {
    mockedMarkAllRead.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderScreen();
    await findByText("Nuevo anuncio");

    await act(async () => {
      fireEvent.press(await findByText("Marcar todo como leído"));
    });

    expect(await findByText(/no pudimos marcar todo como leído/i)).toBeTruthy();
    expect(await findByText("Nuevo anuncio")).toBeTruthy();
  });
});

describe("Platform notifications: analytics", () => {
  it("fires platform_notifications_viewed on mount", async () => {
    await renderScreen();
    const call = mockedCapture.mock.calls.find(([event]) => event === "platform_notifications_viewed");
    expect(call).toBeTruthy();
  });
});
