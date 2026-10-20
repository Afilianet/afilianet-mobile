/**
 * An in-memory phone for tests that exercise the app's REAL survey storage
 * (vault.ts: per-item AES keys in the secure store, sealed files under
 * afn-surveys/{account}/{organization}/) instead of a stand-in.
 *
 * Only the native modules underneath are replaced: expo-file-system,
 * expo-crypto's AES, the secure store and AsyncStorage. Their state lives on
 * globalThis, so it survives jest.resetModules() -- an app restart keeps the
 * phone's data, exactly like the real device.
 *
 * Usage from a test (factories may only require):
 *   jest.mock("expo-file-system", () => require("<rel>/tests/support/fakeDevice").fileSystem);
 *   jest.mock("expo-crypto", () => require("<rel>/tests/support/fakeDevice").crypto);
 *   jest.mock("<rel>/services/storage", () => require("<rel>/tests/support/fakeDevice").storage);
 *   jest.mock("@react-native-async-storage/async-storage", () => require("<rel>/tests/support/fakeDevice").asyncStorage);
 */

interface DeviceState {
  files: Map<string, Uint8Array>;
  dirs: Set<string>;
  secure: Map<string, string>;
  async: Map<string, string>;
  /** Writes so far, by path, for "nothing was rewritten" checks. */
  writes: string[];
  /** Throws on the next file write whose path matches, once (an interrupted write). */
  failWrite: RegExp | null;
  uuid: number;
}

const GLOBAL_KEY = "__afnFakeDevice";

function state(): DeviceState {
  const holder = globalThis as unknown as Record<string, DeviceState | undefined>;
  holder[GLOBAL_KEY] ??= { files: new Map(), dirs: new Set(), secure: new Map(), async: new Map(), writes: [], failWrite: null, uuid: 0 };
  return holder[GLOBAL_KEY]!;
}

export const device = {
  reset() {
    const current = state();
    current.files.clear();
    current.dirs.clear();
    current.secure.clear();
    current.async.clear();
    current.writes.length = 0;
    current.failWrite = null;
    current.uuid = 0;
  },
  files: () => state().files,
  secure: () => state().secure,
  writes: () => state().writes,
  failNextWrite(pattern: RegExp) {
    state().failWrite = pattern;
  },
  /** Every stored file and secure-store entry, copied: compare before/after to prove nothing changed. */
  snapshot(exclude: RegExp = /$^/) {
    const files = [...state().files.entries()].filter(([path]) => !exclude.test(path)).map(([path, bytes]) => [path, Array.from(bytes).join(",")]);
    const secure = [...state().secure.entries()].filter(([key]) => !exclude.test(key));
    return JSON.stringify({ files: files.sort(), secure: secure.sort() });
  },
};

// --- expo-file-system ------------------------------------------------------

type Parent = { uri?: string; path?: string } | string;
const join = (parts: Parent[]) =>
  parts
    .map((part) => (typeof part === "string" ? part : part.path ?? part.uri ?? ""))
    .filter(Boolean)
    .join("/");

class FakeFile {
  readonly path: string;
  constructor(...parts: Parent[]) {
    this.path = join(parts);
  }
  get name() {
    return this.path.split("/").pop() ?? "";
  }
  get exists() {
    return state().files.has(this.path);
  }
  get size() {
    return state().files.get(this.path)?.byteLength ?? null;
  }
  create() {
    state().files.set(this.path, new Uint8Array());
  }
  write(bytes: Uint8Array) {
    const current = state();
    if (current.failWrite?.test(this.path)) {
      current.failWrite = null;
      throw new Error(`Simulated interruption writing ${this.path}`);
    }
    current.files.set(this.path, new Uint8Array(bytes));
    current.writes.push(this.path);
  }
  async bytes() {
    const bytes = state().files.get(this.path);
    if (!bytes) throw new Error(`No file ${this.path}`);
    return new Uint8Array(bytes);
  }
  delete() {
    state().files.delete(this.path);
  }
}

class FakeDirectory {
  readonly path: string;
  constructor(...parts: Parent[]) {
    this.path = join(parts);
  }
  get exists() {
    return state().dirs.has(this.path);
  }
  create() {
    const segments = this.path.split("/");
    segments.forEach((_, index) => state().dirs.add(segments.slice(0, index + 1).join("/")));
  }
  list() {
    const prefix = `${this.path}/`;
    return [...state().files.keys()].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/")).map((path) => new FakeFile(path));
  }
  delete() {
    const prefix = `${this.path}/`;
    for (const path of [...state().files.keys()]) if (path.startsWith(prefix)) state().files.delete(path);
    for (const dir of [...state().dirs]) if (dir === this.path || dir.startsWith(prefix)) state().dirs.delete(dir);
  }
}

export const fileSystem = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { document: { uri: "document" }, availableDiskSpace: 64 * 1024 ** 3 },
};

// --- expo-crypto (AES with a real key check: a wrong key never decrypts) ---

const hex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/../g)!.map((pair) => parseInt(pair, 16)));

class FakeKey {
  constructor(readonly raw: Uint8Array) {}
  static async generate() {
    const raw = new Uint8Array(16);
    for (let index = 0; index < raw.length; index += 1) raw[index] = Math.floor(Math.random() * 256);
    return new FakeKey(raw);
  }
  static async import(value: string) {
    return new FakeKey(fromHex(value));
  }
  async encoded() {
    return hex(this.raw);
  }
}

const xor = (bytes: Uint8Array, key: Uint8Array) => bytes.map((value, index) => value ^ key[index % key.length]);

class FakeSealed {
  constructor(readonly bytes: Uint8Array) {}
  static fromCombined(bytes: Uint8Array) {
    return new FakeSealed(bytes);
  }
  async combined() {
    return this.bytes;
  }
}

export const crypto = {
  AESEncryptionKey: FakeKey,
  AESSealedData: FakeSealed,
  async aesEncryptAsync(bytes: Uint8Array, key: FakeKey) {
    const sealed = new Uint8Array(4 + bytes.byteLength);
    sealed.set(key.raw.slice(0, 4));
    sealed.set(xor(bytes, key.raw), 4);
    return new FakeSealed(sealed);
  },
  async aesDecryptAsync(sealed: FakeSealed, key: FakeKey) {
    if (sealed.bytes.byteLength < 4 || sealed.bytes.slice(0, 4).some((value, index) => value !== key.raw[index])) throw new Error("Decryption failed");
    return xor(sealed.bytes.slice(4), key.raw);
  },
  randomUUID() {
    const value = ++state().uuid;
    return `0000${String(value).padStart(4, "0")}-0000-4000-8000-${String(value).padStart(12, "0")}`;
  },
};

// --- secure store and AsyncStorage -----------------------------------------

export const storage = {
  secureStorage: {
    async get(key: string) {
      return state().secure.get(key) ?? null;
    },
    async set(key: string, value: string) {
      state().secure.set(key, value);
    },
    async remove(key: string) {
      state().secure.delete(key);
    },
  },
};

const asyncStorageApi = {
  async getItem(key: string) {
    return state().async.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    state().async.set(key, value);
  },
  async removeItem(key: string) {
    state().async.delete(key);
  },
};
export const asyncStorage = { __esModule: true, default: asyncStorageApi, ...asyncStorageApi };
