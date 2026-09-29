import { restoreOfflineUser, saveOfflineUser, restoreOfflineOrganizations, saveOfflineOrganizations } from "./offlineSession";
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
