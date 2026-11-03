import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { secureStorage } from "../../services/storage";

/**
 * Protected, per-account, per-organization storage for everything surveys
 * keep on the phone: downloaded questionnaires, drafts, completed answers
 * and interview audio.
 *
 * - Every item is AES-sealed with its OWN key held in the secure store
 *   (Keychain/Keystore), in the app's private document directory -- the
 *   same scheme as the assisted-enrollment photo vault.
 * - Items live under afn-surveys/{account}/{organization}/; a scope can only
 *   ever read or list its own directory, so one account's or organization's
 *   pending data can never be read, sent or attributed by another.
 * - A small registry of scopes that hold data lets sign-out warn about
 *   pending items in ANY of the account's organizations.
 */

export interface SurveyScope {
  userId: string;
  organizationId: string;
}

/** Hard cap on what one account+organization may keep on the phone (mostly audio). */
export const MAX_SCOPE_BYTES = 300 * 1024 * 1024;
/** Never fill the phone: keep at least this much free after any write. */
export const MIN_FREE_BYTES = 200 * 1024 * 1024;

const REGISTRY_KEY = "afn.surveys.scopes";
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export class StorageFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageFullError";
  }
}

function assertScope(scope: SurveyScope) {
  if (!SAFE.test(scope.userId) || !SAFE.test(scope.organizationId)) throw new Error("Invalid survey storage scope.");
}

function assertName(name: string) {
  if (!SAFE.test(name)) throw new Error("Invalid survey storage item name.");
}

export function scopeId(scope: SurveyScope): string {
  assertScope(scope);
  return `${scope.userId}.${scope.organizationId}`;
}

function directory(scope: SurveyScope): Directory {
  assertScope(scope);
  return new Directory(Paths.document, "afn-surveys", scope.userId, scope.organizationId);
}

function keyName(scope: SurveyScope, name: string): string {
  return `afn.surveys.k.${scopeId(scope)}.${name}`;
}

function file(scope: SurveyScope, name: string): File {
  assertName(name);
  return new File(directory(scope), `${name}.sealed`);
}

async function register(scope: SurveyScope): Promise<void> {
  const scopes = await listScopes();
  if (scopes.some((value) => scopeId(value) === scopeId(scope))) return;
  await secureStorage.set(REGISTRY_KEY, JSON.stringify([...scopes, { userId: scope.userId, organizationId: scope.organizationId }]));
}

/** Every account+organization that has survey data on this phone. */
export async function listScopes(): Promise<SurveyScope[]> {
  try {
    const raw = await secureStorage.get(REGISTRY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is SurveyScope =>
        Boolean(value) && SAFE.test((value as SurveyScope).userId) && SAFE.test((value as SurveyScope).organizationId),
    );
  } catch {
    return [];
  }
}

export function usedBytes(scope: SurveyScope): number {
  const dir = directory(scope);
  if (!dir.exists) return 0;
  return dir.list().reduce((total, entry) => total + (entry instanceof File ? entry.size ?? 0 : 0), 0);
}

/** Throws a StorageFullError (Spanish message) before anything is written that would not fit. */
export function ensureSpace(scope: SurveyScope, incomingBytes: number, availableDiskSpace: number = Paths.availableDiskSpace): void {
  if (availableDiskSpace - incomingBytes < MIN_FREE_BYTES) {
    throw new StorageFullError("Tu teléfono tiene poco espacio libre. Libera espacio o sincroniza tus encuestas antes de continuar.");
  }
  if (usedBytes(scope) + incomingBytes > MAX_SCOPE_BYTES) {
    throw new StorageFullError("Llegaste al límite de encuestas guardadas en este teléfono. Sincroniza las pendientes antes de continuar.");
  }
}

export async function sealBytes(scope: SurveyScope, name: string, bytes: Uint8Array): Promise<number> {
  ensureSpace(scope, bytes.byteLength + 64);
  const dir = directory(scope);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  await register(scope);
  const key = await AESEncryptionKey.generate();
  const sealed = await (await aesEncryptAsync(bytes, key)).combined();
  const target = file(scope, name);
  await secureStorage.set(keyName(scope, name), await key.encoded("hex"));
  try {
    if (target.exists) target.delete();
    target.create();
    target.write(sealed);
  } catch (error) {
    if (target.exists) target.delete();
    await secureStorage.remove(keyName(scope, name));
    throw error;
  }
  return sealed.byteLength;
}

export async function openBytes(scope: SurveyScope, name: string): Promise<Uint8Array | null> {
  const target = file(scope, name);
  if (!target.exists) return null;
  const keyHex = await secureStorage.get(keyName(scope, name));
  if (!keyHex) return null;
  const key = await AESEncryptionKey.import(keyHex, "hex");
  return aesDecryptAsync(AESSealedData.fromCombined(await target.bytes()), key);
}

export async function sealJson(scope: SurveyScope, name: string, value: unknown): Promise<void> {
  await sealBytes(scope, name, new TextEncoder().encode(JSON.stringify(value)));
}

export async function openJson<T>(scope: SurveyScope, name: string): Promise<T | null> {
  const bytes = await openBytes(scope, name);
  if (!bytes) return null;
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function removeItem(scope: SurveyScope, name: string): Promise<void> {
  const target = file(scope, name);
  if (target.exists) target.delete();
  await secureStorage.remove(keyName(scope, name));
}

export function hasItem(scope: SurveyScope, name: string): boolean {
  return file(scope, name).exists;
}

/** Explicit, user-confirmed deletion of everything one account+organization keeps. */
export async function wipeScope(scope: SurveyScope): Promise<void> {
  const dir = directory(scope);
  if (dir.exists) {
    for (const entry of dir.list()) {
      if (entry instanceof File) {
        const name = entry.name.replace(/\.sealed$/, "");
        if (SAFE.test(name)) await secureStorage.remove(keyName(scope, name));
      }
    }
    dir.delete();
  }
  const remaining = (await listScopes()).filter((value) => scopeId(value) !== scopeId(scope));
  await secureStorage.set(REGISTRY_KEY, JSON.stringify(remaining));
}
