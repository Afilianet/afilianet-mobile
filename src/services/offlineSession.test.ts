import { forgetOfflineUser, restoreOfflineUser, saveOfflineUser, restoreOfflineOrganizations, saveOfflineOrganizations } from "./offlineSession";
import { secureStorage } from "./storage";
import type { User, Organization } from "../types/api";

const mockStore = new Map<string, string>();
jest.mock("./storage", () => ({
  secureStorage: {
    get: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
    remove: jest.fn(async (key: string) => { mockStore.delete(key); }),
  },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `hash-${value}`),
}));

beforeEach(() => mockStore.clear());

it("restores an offline user only for the same saved session token", async () => {
  const user = { id: "user-a", first_name: "Ana" } as User;
  await saveOfflineUser("session-a", user);
  expect(await restoreOfflineUser("session-a")).toEqual(user);
  expect(await restoreOfflineUser("session-b")).toBeNull();
});

it("never restores another users organizations", async () => {
  const org = { id: "org-a", name: "Afilianet", metadata: { large: "unused" } } as unknown as Organization;
  await saveOfflineOrganizations("user-a", [org]);
  expect(await restoreOfflineOrganizations("user-b")).toBeNull();
  expect(await restoreOfflineOrganizations("user-a")).toEqual([{ ...org, metadata: null }]);
});


describe("offline profile writes racing sign-out or an account switch", () => {
  const userA = { id: "user-a", first_name: "Ana" } as User;
  const userB = { id: "user-b", first_name: "Beto" } as User;
  const setMock = secureStorage.set as jest.Mock;

  function deferNextSet() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    setMock.mockImplementationOnce(async (key: string, value: string) => {
      await gate;
      mockStore.set(key, value);
    });
    return () => release();
  }

  // Waits until a write has actually reached the store (passed every check, now in flight).
  async function writeInFlight() {
    while (!setMock.mock.calls.some(([key]) => key === "afn.offline.user")) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => setMock.mockClear());

  it("a write still in flight when sign-out starts cannot resurrect the removed profile", async () => {
    const release = deferNextSet();
    const save = saveOfflineUser("session-a", userA, () => true);
    await writeInFlight();
    const forget = forgetOfflineUser(); // sign-out while the write is pending
    release();
    await Promise.all([save, forget]);
    expect(mockStore.has("afn.offline.user")).toBe(false);
  });

  it("a write whose session ended before it ran writes nothing", async () => {
    let current = true;
    const release = deferNextSet(); // an unrelated earlier write keeps the queue busy
    const earlier = saveOfflineUser("session-a", userA, () => true);
    const late = saveOfflineUser("session-a", userA, () => current);
    current = false; // signed out while queued
    release();
    await expect(late).resolves.toBe(false);
    await earlier;
    await forgetOfflineUser();
    expect(mockStore.has("afn.offline.user")).toBe(false);
  });

  it("a late write from the previous account never overwrites the new account's profile", async () => {
    let activeToken = "session-a";
    const release = deferNextSet(); // A's write is in flight...
    const writeA = saveOfflineUser("session-a", userA, () => activeToken === "session-a");
    await writeInFlight();
    activeToken = "session-b"; // ...when B signs in
    const writeB = saveOfflineUser("session-b", userB, () => activeToken === "session-b");
    release();
    await Promise.all([writeA, writeB]);
    expect(await restoreOfflineUser("session-b")).toEqual(userB);
    expect(await restoreOfflineUser("session-a")).toBeNull();
  });
});
