import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { analytics } from "../services/analytics";
import { PushLifecycle } from "./PushLifecycle";

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockSelectOrganization = jest.fn<Promise<void>, [string]>();
const mockAuth = { status: "signedIn", user: { id: "user-1" } as { id: string } | null };
const mockOrganization = { status: "ready", organizations: [{ id: "org-a" }], selectOrganization: mockSelectOrganization };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("../state/OrganizationContext", () => ({ useOrganization: () => mockOrganization }));
jest.mock("../services/push", () => ({ registerPush: jest.fn(() => Promise.resolve()) }));
jest.mock("../services/automaticPushRefresh", () => ({ createAutomaticPushRefresh: () => jest.fn() }));
jest.mock("../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

let mockResponseListener: ((response: Notifications.NotificationResponse) => void) | null = null;
let mockLastResponse: Notifications.NotificationResponse | null = null;
const mockClearLastResponse = jest.fn(() => Promise.resolve());

jest.mock("expo-notifications", () => ({
  addPushTokenListener: () => ({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockResponseListener = listener;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: () => Promise.resolve(mockLastResponse),
  clearLastNotificationResponseAsync: () => mockClearLastResponse(),
}));

let appStateListener: ((state: AppStateStatus) => void) | null = null;

function tap(identifier: string, organizationId = "org-a"): Notifications.NotificationResponse {
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: { request: { identifier, content: { data: { screen: "notifications", organization_id: organizationId } } } },
  } as unknown as Notifications.NotificationResponse;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

function openedEvents() {
  return (analytics.capture as jest.Mock).mock.calls.filter(([event]) => event === "push_notification_opened");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResponseListener = null;
  mockLastResponse = null;
  appStateListener = null;
  mockAuth.status = "signedIn";
  mockAuth.user = { id: "user-1" };
  mockSelectOrganization.mockImplementation(() => Promise.resolve());
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

describe("PushLifecycle: opening a push", () => {
  it("handles the same tap once even when the live listener and the cold-start replay both deliver it", async () => {
    mockLastResponse = tap("push-1");
    await act(async () => {
      render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/notifications");
    expect(openedEvents()).toEqual([["push_notification_opened"]]);
    expect(mockClearLastResponse).toHaveBeenCalled();
  });

  it("opens the inbox for each distinct tap, and ignores pushes for an organization the user does not belong to", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
    });
    await act(async () => {
      mockResponseListener?.(tap("push-2"));
    });
    await act(async () => {
      mockResponseListener?.(tap("push-3", "org-other"));
    });

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(openedEvents()).toHaveLength(2);
    expect(mockSelectOrganization).not.toHaveBeenCalledWith("org-other");
  });

  it("keeps a tap pending when selecting the organization fails, and completes it on the next foreground", async () => {
    mockSelectOrganization.mockImplementationOnce(() => Promise.reject(new Error("storage unavailable")));
    await act(async () => {
      render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(openedEvents()).toHaveLength(0);
    expect(mockClearLastResponse).not.toHaveBeenCalled();

    await act(async () => {
      appStateListener?.("active");
    });

    expect(mockSelectOrganization).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(openedEvents()).toHaveLength(1);
  });

  it("never navigates when the session ends while the organization is being selected", async () => {
    const selection = deferred();
    mockSelectOrganization.mockImplementationOnce(() => selection.promise);
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
    });

    mockAuth.status = "signedOut";
    mockAuth.user = null;
    await act(async () => {
      screen.rerender(<PushLifecycle />);
    });
    await act(async () => {
      selection.resolve();
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(openedEvents()).toHaveLength(0);
    expect(mockClearLastResponse).toHaveBeenCalled();
  });

  it("drops a pending tap from a previous user instead of opening it in the next session", async () => {
    mockSelectOrganization.mockImplementationOnce(() => Promise.reject(new Error("storage unavailable")));
    let screen!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      screen = await render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
    });

    mockAuth.user = { id: "user-2" };
    await act(async () => {
      screen.rerender(<PushLifecycle />);
    });
    await act(async () => {
      appStateListener?.("active");
    });

    expect(mockSelectOrganization).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the latest tap when a newer one arrives while the previous one is still in flight", async () => {
    const first = deferred();
    mockSelectOrganization.mockImplementationOnce(() => first.promise);
    await act(async () => {
      render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
      mockResponseListener?.(tap("push-2"));
    });
    await act(async () => {
      first.resolve();
    });

    expect(mockSelectOrganization).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(openedEvents()).toHaveLength(1);
  });
});
