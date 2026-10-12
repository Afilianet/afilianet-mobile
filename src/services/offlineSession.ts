import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { Organization, User } from "../types/api";
import { secureStorage } from "./storage";

const USER_KEY = "afn.offline.user";
const orgIndexKey = (userId: string) => `afn.offline.orgs.${userId}`;
const orgKey = (userId: string, id: string) => `afn.offline.org.${userId}.${id}`;

// Every read-modify of the offline profile runs in order. A forget (sign-out)
// queued behind an in-flight save therefore always runs AFTER it, so a slow
// write can never resurrect a profile that sign-out removed.
let userTail: Promise<unknown> = Promise.resolve();

function serializedUser<T>(action: () => Promise<T>): Promise<T> {
  const next = userTail.then(action, action);
  userTail = next.catch(() => undefined);
  return next;
}

/**
 * Saves the profile for offline use, but only if `stillCurrent()` -- the
 * session this profile belongs to -- is still the active one at the moment
 * of writing. A save that loses the race against sign-out or an account
 * switch writes nothing, so it can neither restore a removed profile nor
 * overwrite another account's.
 */
export async function saveOfflineUser(token: string, user: User, stillCurrent: () => boolean = () => true): Promise<boolean> {
  return serializedUser(async () => {
    if (!stillCurrent()) return false;
    const tokenHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
    if (!stillCurrent()) return false;
    await secureStorage.set(USER_KEY, JSON.stringify({ tokenHash, user }));
    return true;
  });
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
  await serializedUser(() => secureStorage.remove(USER_KEY));
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
