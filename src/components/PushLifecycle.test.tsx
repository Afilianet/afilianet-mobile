import { act, render } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { PushLifecycle } from "./PushLifecycle";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";

const mockPush = jest.fn();
const mockSelectOrganization = jest.fn().mockResolvedValue(undefined);
let responseListener: ((response: Notifications.NotificationResponse) => void) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../state/OrganizationContext", () => ({
  useOrganization: jest.fn(),
}));

jest.mock("../services/push", () => ({ registerPush: jest.fn() }));
jest.mock("../services/automaticPushRefresh", () => ({ createAutomaticPushRefresh: () => jest.fn() }));

jest.mock("expo-notifications", () => ({
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: Notifications.NotificationResponse) => void) => {
    responseListener = listener;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseOrganization = useOrganization as jest.Mock;

const ORG_A = { id: "org-a", name: "Org A" };

function response(data: Record<string, unknown>): Notifications.NotificationResponse {
  return { notification: { request: { content: { data } } } } as unknown as Notifications.NotificationResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  responseListener = null;
  mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: "u1" }, error: null, signIn: jest.fn(), registerFromReferral: jest.fn(), signOut: jest.fn() });
  mockedUseOrganization.mockReturnValue({
    status: "ready",
    organizations: [ORG_A],
    activeOrganization: ORG_A,
    error: null,
    selectOrganization: mockSelectOrganization,
    refresh: jest.fn(),
  });
});

describe("PushLifecycle: one shared tap-to-navigate listener", () => {
  it("navigates to a platform notification screen without requiring organization selection", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });
    expect(responseListener).toBeTruthy();

    await act(async () => {
      responseListener!(response({ screen: "platform-notifications" }));
      await Promise.resolve();
    });

    expect(mockPush).toHaveBeenCalledWith("/platform-notifications");
    expect(mockSelectOrganization).not.toHaveBeenCalled();
  });

  it("still selects the organization and navigates for an organization-scoped notification", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });

    await act(async () => {
      responseListener!(response({ screen: "notifications", organization_id: "org-a" }));
      await Promise.resolve();
    });

    expect(mockSelectOrganization).toHaveBeenCalledWith("org-a");
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("navigates nowhere for an organization id the user doesn't belong to -- fails safe", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });

    await act(async () => {
      responseListener!(response({ screen: "notifications", organization_id: "org-unknown" }));
      await Promise.resolve();
    });

    expect(mockSelectOrganization).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates nowhere for a payload with neither organization_id nor a recognized platform screen -- fails safe", async () => {
    await act(async () => {
      render(<PushLifecycle />);
    });

    await act(async () => {
      responseListener!(response({ screen: "some-other-app://danger" }));
      await Promise.resolve();
    });

    expect(mockSelectOrganization).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
