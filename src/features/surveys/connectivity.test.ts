import { isOnline, subscribeReconnect } from "./connectivity";

type Listener = (state: { isConnected?: boolean; isInternetReachable?: boolean }) => void;
const mockListeners: Listener[] = [];
const mockRemove = jest.fn();
let mockInitial: { isConnected?: boolean; isInternetReachable?: boolean } = { isConnected: true, isInternetReachable: true };

jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn((listener: Listener) => {
    mockListeners.push(listener);
    return { remove: mockRemove };
  }),
  getNetworkStateAsync: jest.fn(async () => mockInitial),
}));

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockListeners.length = 0;
  mockRemove.mockReset();
  mockInitial = { isConnected: true, isInternetReachable: true };
});

describe("survey connectivity", () => {
  it("treats an unknown internet reachability as online, a known lack of it as offline", () => {
    expect(isOnline({ isConnected: true })).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
    expect(isOnline({})).toBe(false);
  });

  it("fires once when airplane mode is turned off, not while it stays on nor while already online", async () => {
    mockInitial = { isConnected: false, isInternetReachable: false };
    const onReconnect = jest.fn();
    const unsubscribe = subscribeReconnect(onReconnect);
    await flush();

    mockListeners[0]({ isConnected: false, isInternetReachable: false });
    expect(onReconnect).not.toHaveBeenCalled();
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(onReconnect).toHaveBeenCalledTimes(1);
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(onReconnect).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("does not fire at start when the phone is already online", async () => {
    const onReconnect = jest.fn();
    subscribeReconnect(onReconnect);
    await flush();
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("Wi-Fi without internet is not a reconnection; internet arriving later is", async () => {
    mockInitial = { isConnected: false };
    const onReconnect = jest.fn();
    subscribeReconnect(onReconnect);
    await flush();
    mockListeners[0]({ isConnected: true, isInternetReachable: false });
    expect(onReconnect).not.toHaveBeenCalled();
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
