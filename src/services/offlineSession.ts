import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { Organization, User } from "../types/api";
import { secureStorage } from "./storage";

const USER_KEY = "afn.offline.user";
const orgIndexKey = (userId: string) => `afn.offline.orgs.${userId}`;
const orgKey = (userId: string, id: string) => `afn.offline.org.${userId}.${id}`;

export async function saveOfflineUser(token: string, user: User): Promise<void> {
  const tokenHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
  await secureStorage.set(USER_KEY, JSON.stringify({ tokenHash, user }));
}

export async function restoreOfflineUser(token: string): Promise<User | null> {
  try {
    const raw = await secureStorage.get(USER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { tokenHash: string; user: User };
    const tokenHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
    return saved.tokenHash === tokenHash && typeof saved.user?.id === "string" ? saved.user : null;
  } catch { return null; }
}

export async function forgetOfflineUser(): Promise<void> {
  await secureStorage.remove(USER_KEY);
}

export async function saveOfflineOrganizations(userId: string, organizations: Organization[]): Promise<void> {
  for (const org of organizations) {
    // Large metadata has no purpose for offline registration and may exceed keychain limits.
    await secureStorage.set(orgKey(userId, org.id), JSON.stringify({ ...org, metadata: null }));
  }
  await secureStorage.set(orgIndexKey(userId), JSON.stringify(organizations.map((org) => org.id)));
}

export async function restoreOfflineOrganizations(userId: string): Promise<Organization[] | null> {
  try {
    const raw = await secureStorage.get(orgIndexKey(userId));
    if (!raw) return null;
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) return null;
    const records = await Promise.all(ids.map((id) => secureStorage.get(orgKey(userId, id))));
    return records.flatMap((record) => {
      if (!record) return [];
      const org = JSON.parse(record) as Organization;
      return typeof org.id === "string" ? [org] : [];
    });
  } catch { return null; }
}
