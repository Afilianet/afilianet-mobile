import { registerPush } from "../../services/push";
import { apiRequest } from "../../api/client";
import * as Notifications from "expo-notifications";
jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { easConfig: { projectId: "test-project" } } }));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { DEFAULT: 3 }, getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getExpoPushTokenAsync: jest.fn(),
}));
it("times out a native token request and never registers a late token", async () => {
  jest.useFakeTimers();
  try {
    (apiRequest as jest.Mock).mockResolvedValue({ data: { enabled: true } });
    let finish!: (value: { data: string }) => void;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const outcome = registerPush(true).catch(error => error);
    await jest.advanceTimersByTimeAsync(20001);
    expect((await outcome).kind).toBe("timeout");
    finish({ data: "ExpoPushToken[test]" });
    await Promise.resolve();
    expect((apiRequest as jest.Mock).mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
  } finally { jest.useRealTimers(); }
});
