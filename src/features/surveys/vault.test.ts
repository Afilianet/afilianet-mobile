import { ensureSpace, MAX_SCOPE_BYTES, MIN_FREE_BYTES, scopeId, StorageFullError, usedBytes } from "./vault";

// Only the size bookkeeping is exercised here; encryption is expo-crypto's.
jest.mock("expo-crypto", () => ({}));
jest.mock("../../services/storage", () => ({ secureStorage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } }));
jest.mock("expo-file-system", () => {
  class File {
    constructor(public size: number | null = 0) {}
  }
  class Directory {
    static contents: Record<string, number[]> = {};
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.filter((part) => typeof part === "string").join("/");
    }
    get exists() {
      return this.path in Directory.contents;
    }
    list() {
      return (Directory.contents[this.path] ?? []).map((size) => new File(size));
    }
  }
  return { File, Directory, Paths: { document: { uri: "doc" }, availableDiskSpace: 10 * 1024 ** 3 } };
});

const { Directory } = jest.requireMock("expo-file-system") as { Directory: { contents: Record<string, number[]> } };
const SCOPE = { userId: "user-1", organizationId: "org-a" };
const MB = 1024 * 1024;

beforeEach(() => {
  Directory.contents = {};
});

describe("survey storage limits", () => {
  it("refuses a write that would leave the phone under the free-space floor", () => {
    expect(() => ensureSpace(SCOPE, 10 * MB, MIN_FREE_BYTES + 5 * MB)).toThrow(StorageFullError);
    expect(() => ensureSpace(SCOPE, 10 * MB, MIN_FREE_BYTES + 5 * MB)).toThrow(/poco espacio libre/);
    expect(() => ensureSpace(SCOPE, 1 * MB, MIN_FREE_BYTES + 5 * MB)).not.toThrow();
  });

  it("caps what one account+organization may keep, counting only its own directory", () => {
    Directory.contents["afn-surveys/user-1/org-a"] = [MAX_SCOPE_BYTES - 2 * MB];
    Directory.contents["afn-surveys/user-1/org-b"] = [MAX_SCOPE_BYTES];
    expect(usedBytes(SCOPE)).toBe(MAX_SCOPE_BYTES - 2 * MB);
    expect(() => ensureSpace(SCOPE, 1 * MB, 10 * 1024 * MB)).not.toThrow();
    expect(() => ensureSpace(SCOPE, 3 * MB, 10 * 1024 * MB)).toThrow(/límite de encuestas/);
  });

  it("rejects scope identifiers that could escape their directory", () => {
    expect(() => scopeId({ userId: "../user-2", organizationId: "org-a" })).toThrow();
    expect(() => usedBytes({ userId: "user-1", organizationId: "org-a/../org-b" })).toThrow();
    expect(scopeId(SCOPE)).toBe("user-1.org-a");
  });
});
