import { secureStorage } from "../services/storage";
import {
  clearPendingReferral,
  getPendingReferral,
  hydratePendingReferral,
  pendingReferralPath,
  savePendingReferral,
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
    await savePendingReferral("org-one", "AFF100", 1_000);
    await clearPendingReferralInMemoryOnly();
    expect(getPendingReferral()).toBeNull();

    await hydratePendingReferral(1_000 + DAY);
    expect(getPendingReferral()).toMatchObject({ organizationId: "org-one", code: "AFF100" });
    expect(pendingReferralPath(getPendingReferral()!)).toBe("/join/org-one/AFF100");
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
