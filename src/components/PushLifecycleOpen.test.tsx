import { act, render } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { analytics } from "../services/analytics";
import { PushLifecycle } from "./PushLifecycle";

const mockPush = jest.fn();
const mockSelectOrganization = jest.fn(() => Promise.resolve());

const mockRouter = { push: mockPush };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("../auth/AuthContext", () => ({ useAuth: () => ({ status: "signedIn", user: { id: "user-1" } }) }));
jest.mock("../state/OrganizationContext", () => ({
  useOrganization: () => ({ status: "ready", organizations: [{ id: "org-a" }], selectOrganization: mockSelectOrganization }),
}));
jest.mock("../services/push", () => ({ registerPush: jest.fn(() => Promise.resolve()) }));
jest.mock("../services/automaticPushRefresh", () => ({ createAutomaticPushRefresh: () => jest.fn() }));
jest.mock("../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

let mockResponseListener: ((response: Notifications.NotificationResponse) => void) | null = null;
let mockLastResponse: Notifications.NotificationResponse | null = null;

jest.mock("expo-notifications", () => ({
  addPushTokenListener: () => ({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockResponseListener = listener;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: () => Promise.resolve(mockLastResponse),
  clearLastNotificationResponseAsync: () => Promise.resolve(),
}));

function tap(identifier: string, organizationId = "org-a"): Notifications.NotificationResponse {
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: { request: { identifier, content: { data: { screen: "notifications", organization_id: organizationId } } } },
  } as unknown as Notifications.NotificationResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResponseListener = null;
  mockLastResponse = null;
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
    expect((analytics.capture as jest.Mock).mock.calls.filter(([event]) => event === "push_notification_opened")).toEqual([
      ["push_notification_opened"],
    ]);
  });

  it("opens the inbox for each distinct tap, and ignores pushes for an organization the user does not belong to", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });
    await act(async () => {
      mockResponseListener?.(tap("push-1"));
      mockResponseListener?.(tap("push-2"));
      mockResponseListener?.(tap("push-3", "org-other"));
    });

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(analytics.capture).toHaveBeenCalledTimes(2);
  });
});
