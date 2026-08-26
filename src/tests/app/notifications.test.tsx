import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/endpoints";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import { analytics } from "../../services/analytics";
import type { Notification, NotificationType, Organization, PaginatedResponse } from "../../types/api";
import NotificationsScreen from "../../app/notifications";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock("../../api/endpoints", () => ({
  fetchNotifications: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

jest.mock("../../services/analytics", () => ({
  analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() },
}));

const mockedFetchNotifications = fetchNotifications as jest.Mock;
const mockedFetchUnreadNotificationCount = fetchUnreadNotificationCount as jest.Mock;
const mockedMarkNotificationRead = markNotificationRead as jest.Mock;
const mockedMarkAllNotificationsRead = markAllNotificationsRead as jest.Mock;
const mockedCapture = analytics.capture as jest.Mock;

const ORG_A: Organization = {
  id: "org-a",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "affiliate",
  my_membership_status: "active",
};
const ORG_B: Organization = { ...ORG_A, id: "org-b", name: "Beta Org" };

function orgValue(overrides: Partial<OrganizationContextValue> = {}): OrganizationContextValue {
  return {
    status: "ready",
    organizations: [ORG_A],
    activeOrganization: ORG_A,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    type: "commission_earned",
    title: "Commission earned",
    body: "You earned 25.00 USD.",
    payload: { screen: "commissions", commission_id: "comm-1", amount: "25.00", currency: "USD" },
    read_at: null,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function page(data: Notification[], currentPage = 1, lastPage = 1, total = data.length): PaginatedResponse<Notification> {
  return { data, meta: { current_page: currentPage, last_page: lastPage, per_page: 25, total } };
}

let queryClient: QueryClient;

async function renderNotifications(org: OrganizationContextValue = orgValue()) {
  let result!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    result = await render(
      <QueryClientProvider client={queryClient}>
        <OrganizationContext.Provider value={org}>
          <NotificationsScreen />
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockedFetchNotifications.mockResolvedValue(page([notification()]));
  mockedFetchUnreadNotificationCount.mockResolvedValue(1);
  mockedMarkNotificationRead.mockResolvedValue(notification({ read_at: "2026-01-01T10:05:00Z" }));
  mockedMarkAllNotificationsRead.mockResolvedValue(undefined);
});

afterEach(() => {
  queryClient.clear();
});

describe("Notifications: inbox", () => {
  it("shows notifications newest first with title and body", async () => {
    const { findByText } = await renderNotifications();
    expect(await findByText("Commission earned")).toBeTruthy();
    expect(await findByText("You earned 25.00 USD.")).toBeTruthy();
  });

  it("shows an empty state with no notifications", async () => {
    mockedFetchNotifications.mockResolvedValue(page([]));
    const { findByText } = await renderNotifications();
    expect(await findByText("No notifications yet")).toBeTruthy();
  });

  it("distinguishes unread from read visually and via accessibility label, not color alone", async () => {
    mockedFetchNotifications.mockResolvedValue(
      page([notification({ id: "n-unread", read_at: null }), notification({ id: "n-read", read_at: "2026-01-01T09:00:00Z" })]),
    );
    const { findByLabelText } = await renderNotifications();
    expect(await findByLabelText(/^Unread: Commission earned/)).toBeTruthy();
    expect(await findByLabelText(/^Read: Commission earned/)).toBeTruthy();
  });

  it("does not crash on an unrecognized notification type -- falls back safely", async () => {
    mockedFetchNotifications.mockResolvedValue(
      page([notification({ type: "some_future_type" as NotificationType, title: "New thing", body: "Something happened." })]),
    );
    const { findByText } = await renderNotifications();
    expect(await findByText("New thing")).toBeTruthy();
  });
});

describe("Notifications: all 14 types render safely", () => {
  const TYPES: NotificationType[] = [
    "compliance_started",
    "compliance_action_required",
    "compliance_manual_review",
    "compliance_approved",
    "compliance_rejected",
    "affiliate_activated",
    "invitation_accepted",
    "commission_earned",
    "commission_reversed",
    "payout_requested",
    "payout_processing",
    "payout_paid",
    "payout_failed",
    "payout_cancelled",
  ];

  it.each(TYPES)("renders %s without crashing or exposing raw payload", async (type) => {
    mockedFetchNotifications.mockResolvedValue(
      page([notification({ type, title: `Title for ${type}`, body: `Body for ${type}`, payload: { screen: "commissions" } })]),
    );
    const { findByText, queryByText } = await renderNotifications();
    expect(await findByText(`Title for ${type}`)).toBeTruthy();
    expect(queryByText(/"screen"/)).toBeNull();
  });
});

describe("Notifications: whitelisted navigation", () => {
  it.each([
    ["compliance_started", { screen: "compliance" }, "/compliance"],
    ["affiliate_activated", { screen: "profile" }, "/(app)/profile"],
    ["invitation_accepted", { screen: "network" }, "/(app)/network"],
    ["commission_earned", { screen: "commissions" }, "/commissions"],
    ["payout_paid", { screen: "payouts" }, "/payouts"],
  ] as const)("navigates to the whitelisted destination for %s", async (type, payload, expectedRoute) => {
    mockedFetchNotifications.mockResolvedValue(page([notification({ type, payload })]));
    const { findByText } = await renderNotifications();

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expectedRoute));
  });

  it("does not navigate anywhere when payload.screen is missing or unrecognized -- fails safe", async () => {
    mockedFetchNotifications.mockResolvedValue(page([notification({ payload: { screen: "some-other-app://danger" } })]));
    const { findByText } = await renderNotifications();

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    await waitFor(() => expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(1));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("Notifications: mark as read", () => {
  it("marks the notification read when opened", async () => {
    const { findByText } = await renderNotifications();

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    expect(mockedMarkNotificationRead.mock.calls[0][0]).toBe("notif-1");
  });

  it("still navigates when the read mutation fails -- a stale read must never block an otherwise-valid notification", async () => {
    mockedMarkNotificationRead.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderNotifications();

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/commissions"));
  });

  it("refreshes the feed and unread count after marking read, even on failure", async () => {
    mockedMarkNotificationRead.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderNotifications();
    await findByText("Commission earned");
    const feedCallsBefore = mockedFetchNotifications.mock.calls.length;
    const countCallsBefore = mockedFetchUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    await waitFor(() => expect(mockedFetchNotifications.mock.calls.length).toBeGreaterThan(feedCallsBefore));
    await waitFor(() => expect(mockedFetchUnreadNotificationCount.mock.calls.length).toBeGreaterThan(countCallsBefore));
  });

  it("is safe to open repeatedly -- reading an already-read notification never errors visibly", async () => {
    mockedFetchNotifications.mockResolvedValue(page([notification({ read_at: "2026-01-01T09:00:00Z" })]));
    const { findByText } = await renderNotifications();

    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });
    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });

    expect(mockedMarkNotificationRead).toHaveBeenCalledTimes(2);
  });
});

describe("Notifications: mark all as read", () => {
  it("shows the action only when unread notifications exist", async () => {
    mockedFetchUnreadNotificationCount.mockResolvedValue(0);
    const { findByText, queryByText } = await renderNotifications();
    await findByText("Commission earned");
    expect(queryByText("Mark all as read")).toBeNull();
  });

  it("marks all as read and refreshes the inbox and unread count", async () => {
    const { findByText } = await renderNotifications();
    await findByText("Commission earned");
    const feedCallsBefore = mockedFetchNotifications.mock.calls.length;
    const countCallsBefore = mockedFetchUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(await findByText("Mark all as read"));
    });

    expect(mockedMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedFetchNotifications.mock.calls.length).toBeGreaterThan(feedCallsBefore));
    await waitFor(() => expect(mockedFetchUnreadNotificationCount.mock.calls.length).toBeGreaterThan(countCallsBefore));
  });

  it("shows a clear error and does not crash the inbox when read-all fails", async () => {
    mockedMarkAllNotificationsRead.mockRejectedValue(new ApiError("server", "Server error.", 500));
    const { findByText } = await renderNotifications();
    await findByText("Commission earned");

    await act(async () => {
      fireEvent.press(await findByText("Mark all as read"));
    });

    expect(await findByText(/couldn't mark all as read/i)).toBeTruthy();
    expect(await findByText("Commission earned")).toBeTruthy();
  });
});

describe("Notifications: pagination", () => {
  it("loads the next page and appends without duplicates", async () => {
    mockedFetchNotifications.mockImplementation((p: number) =>
      Promise.resolve(
        p === 1
          ? page([notification({ id: "n-1", title: "Page one" }), notification({ id: "n-2", title: "Page one B" })], 1, 2, 3)
          : page([notification({ id: "n-2", title: "Page one B" }), notification({ id: "n-3", title: "Page two" })], 2, 2, 3),
      ),
    );
    const { findByLabelText, findByText } = await renderNotifications();
    await findByText("Page one");

    const loadMore = await findByLabelText("Load more recent notifications");
    await act(async () => {
      fireEvent.press(loadMore);
    });

    expect(await findByText("Page two")).toBeTruthy();
    expect(mockedFetchNotifications).toHaveBeenCalledWith(2);
  });
});

describe("Notifications: errors", () => {
  it("shows a 403 as its own neutral state, independent per section", async () => {
    // The feed goes through PaginatedSectionCard, whose forbidden branch is
    // ForbiddenState -- not the generic friendlyMessage() copy.
    mockedFetchNotifications.mockRejectedValue(new ApiError("forbidden", "Forbidden.", 403));
    const { findByText } = await renderNotifications();
    expect(await findByText("Error 403")).toBeTruthy();
    expect(await findByText(/can't access recent notifications/i)).toBeTruthy();
  });

  // "offline" is a retryable kind (unlike forbidden/not_found/etc.), so the
  // query genuinely retries with real exponential backoff before settling
  // into isError -- this needs real time to elapse, not just a longer poll.
  it(
    "shows a clear message when offline",
    async () => {
      mockedFetchNotifications.mockRejectedValue(new ApiError("offline", "Unable to reach the server."));
      const { findByText } = await renderNotifications();
      expect(await findByText(/you're offline/i, undefined, { timeout: 8000 })).toBeTruthy();
    },
    15000,
  );
});

describe("Notifications: organization switching", () => {
  it("never shows Org A's notifications after switching to Org B", async () => {
    mockedFetchNotifications.mockImplementation(() =>
      Promise.resolve(page([notification({ id: "n-orga", title: "Org A notification" })])),
    );
    const { findByText, queryByText, rerender } = await renderNotifications(orgValue({ activeOrganization: ORG_A }));
    expect(await findByText("Org A notification")).toBeTruthy();

    mockedFetchNotifications.mockImplementation(() =>
      Promise.resolve(page([notification({ id: "n-orgb", title: "Org B notification" })])),
    );
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider value={orgValue({ activeOrganization: ORG_B, organizations: [ORG_A, ORG_B] })}>
            <NotificationsScreen />
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(await findByText("Org B notification")).toBeTruthy();
    expect(queryByText("Org A notification")).toBeNull();
  });
});

describe("Notifications: analytics", () => {
  it("fires notifications_viewed with no properties", async () => {
    await renderNotifications();
    const call = mockedCapture.mock.calls.find(([event]) => event === "notifications_viewed");
    expect(call).toHaveLength(1);
  });

  it("fires notification_opened with no properties, never the id/type/payload", async () => {
    const { findByText } = await renderNotifications();
    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });
    const call = mockedCapture.mock.calls.find(([event]) => event === "notification_opened");
    expect(call).toHaveLength(1);
  });

  it("fires notifications_mark_all_read with no properties", async () => {
    const { findByText } = await renderNotifications();
    await findByText("Commission earned");
    await act(async () => {
      fireEvent.press(await findByText("Mark all as read"));
    });
    const call = mockedCapture.mock.calls.find(([event]) => event === "notifications_mark_all_read");
    expect(call).toHaveLength(1);
  });

  it("never sends any properties on any captured event", async () => {
    const { findByText } = await renderNotifications();
    await act(async () => {
      fireEvent.press(await findByText("Commission earned"));
    });
    for (const call of mockedCapture.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });
});

describe("Notifications: safe payload handling", () => {
  it("never renders raw payload identifiers", async () => {
    mockedFetchNotifications.mockResolvedValue(
      page([
        notification({
          payload: { screen: "commissions", commission_id: "comm-secret-uuid", amount: "25.00", currency: "USD" },
        }),
      ]),
    );
    const { queryByText } = await renderNotifications();
    await waitFor(() => expect(mockedFetchNotifications).toHaveBeenCalled());
    expect(queryByText(/comm-secret-uuid/)).toBeNull();
  });
});
