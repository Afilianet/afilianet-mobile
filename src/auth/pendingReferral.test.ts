import { secureStorage } from "../services/storage";
import {
  clearPendingReferral,
  getPendingReferral,
  hydratePendingReferral,
  pendingReferralPath,
  savePendingReferral,
  watchPendingReferralExpiry,
} from "./pendingReferral";

jest.mock("../services/storage", () => {
  const store = new Map<string, string>();
  return {
    secureStorage: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
      remove: jest.fn(async (key: string) => void store.delete(key)),
      __store: store,
    },
  };
});

const store = (secureStorage as unknown as { __store: Map<string, string> }).__store;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  store.clear();
  await clearPendingReferral();
});

describe("pending referral", () => {
  it("survives an app restart (persisted, then hydrated)", async () => {
    jest.useFakeTimers({ now: 1_000 });
    await savePendingReferral("org-one", "AFF100", 1_000);
    await clearPendingReferralInMemoryOnly();
    expect(getPendingReferral()).toBeNull();

    jest.setSystemTime(1_000 + DAY);
    await hydratePendingReferral(1_000 + DAY);
    expect(getPendingReferral()).toMatchObject({ organizationId: "org-one", code: "AFF100" });
    expect(pendingReferralPath(getPendingReferral()!)).toBe("/join/org-one/AFF100");
    jest.useRealTimers();
  });

  it("expires after 7 days and removes the stored copy", async () => {
    await savePendingReferral("org-one", "AFF100", 0);
    await hydratePendingReferral(8 * DAY);
    expect(getPendingReferral()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("refuses tampered values instead of building a route from them", async () => {
    await savePendingReferral("../../evil", "AFF100");
    expect(getPendingReferral()).toBeNull();
    store.set("afilianet.pendingReferral", JSON.stringify({ organizationId: "org/../x", code: "A", savedAt: Date.now() }));
    await hydratePendingReferral();
    expect(getPendingReferral()).toBeNull();
  });

  it("is cleared completely", async () => {
    await savePendingReferral("org-one", "AFF100");
    await clearPendingReferral();
    expect(getPendingReferral()).toBeNull();
    expect(store.size).toBe(0);
  });
});

// Simulates a cold start: memory gone, storage intact.
async function clearPendingReferralInMemoryOnly() {
  const saved = new Map(store);
  await clearPendingReferral();
  saved.forEach((value, key) => store.set(key, value));
}

describe("pending referral in an app that stays open for days", () => {
  const { AppState } = jest.requireActual("react-native") as typeof import("react-native");

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is never offered or continued once 7 days pass, even before anything purges it", async () => {
    jest.useFakeTimers({ now: 0 });
    await savePendingReferral("org-one", "AFF100", 0);
    expect(getPendingReferral()).not.toBeNull();

    jest.setSystemTime(7 * DAY + 60_000); // still open, no restart, no hydrate
    expect(getPendingReferral()).toBeNull();
    expect(pendingReferralPathOrNull()).toBeNull();
  });

  it("is purged from storage when the app returns to the foreground after 7 days", async () => {
    let listener: ((state: string) => void) | undefined;
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
      listener = handler as (state: string) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    jest.useFakeTimers({ now: 0 });
    await savePendingReferral("org-one", "AFF100", 0);
    watchPendingReferralExpiry();
    expect(listener).toBeDefined();

    jest.setSystemTime(8 * DAY);
    await listener?.("active");
    await Promise.resolve();
    expect(store.size).toBe(0);
    spy.mockRestore();
  });

  it("is purged by the expiry timer while the app stays in the foreground", async () => {
    jest.useFakeTimers({ now: 0 });
    await savePendingReferral("org-one", "AFF100", 0);
    jest.setSystemTime(7 * DAY + 2_000);
    await jest.advanceTimersByTimeAsync(7 * DAY + 2_000);
    expect(store.size).toBe(0);
  });
});

function pendingReferralPathOrNull() {
  const referral = getPendingReferral();
  return referral ? pendingReferralPath(referral) : null;
}
