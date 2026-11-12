import { secureStorage } from "../../services/storage";
import { ensureSpace, MAX_SCOPE_BYTES, MIN_FREE_BYTES, scopeId, StorageFullError, usedBytes, wipeScope } from "./vault";

// Only the size bookkeeping is exercised here; encryption is expo-crypto's.
jest.mock("expo-crypto", () => ({}));
jest.mock("../../services/storage", () => ({ secureStorage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } }));
jest.mock("expo-file-system", () => {
  class File {
    constructor(public size: number | null = 0, public name = "") {}
  }
  class Directory {
    static contents: Record<string, number[]> = {};
    /** Named files, for wipeScope: path -> file names. */
    static named: Record<string, string[]> = {};
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.filter((part) => typeof part === "string").join("/");
    }
    get exists() {
      return this.path in Directory.contents || this.path in Directory.named;
    }
    list() {
      return [...(Directory.contents[this.path] ?? []).map((size) => new File(size)), ...(Directory.named[this.path] ?? []).map((name) => new File(0, name))];
    }
    delete() {
      delete Directory.contents[this.path];
      delete Directory.named[this.path];
    }
  }
  return { File, Directory, Paths: { document: { uri: "doc" }, availableDiskSpace: 10 * 1024 ** 3 } };
});

const { Directory } = jest.requireMock("expo-file-system") as { Directory: { contents: Record<string, number[]>; named: Record<string, string[]> } };
const SCOPE = { userId: "user-1", organizationId: "org-a" };
const MB = 1024 * 1024;

beforeEach(() => {
  Directory.contents = {};
  Directory.named = {};
  jest.clearAllMocks();
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

describe("wipeScope («Cerrar sesión y borrarlas»)", () => {
  it("deletes that account+organization's responses AND audio, and nothing else: other organizations and assisted drafts stay", async () => {
    const OTHER_ORG = { userId: "user-1", organizationId: "org-b" };
    Directory.named["afn-surveys/user-1/org-a"] = ["answers-r-1.sealed", "audio-aud-1.sealed"];
    Directory.named["afn-surveys/user-1/org-b"] = ["answers-r-2.sealed"];
    (secureStorage.get as jest.Mock).mockImplementation(async (key: string) =>
      key === "afn.surveys.scopes" ? JSON.stringify([SCOPE, OTHER_ORG]) : null,
    );

    await wipeScope(SCOPE);

    expect((secureStorage.remove as jest.Mock).mock.calls.map(([key]) => key)).toEqual([
      `afn.surveys.k.${scopeId(SCOPE)}.answers-r-1`,
      `afn.surveys.k.${scopeId(SCOPE)}.audio-aud-1`,
    ]);
    expect("afn-surveys/user-1/org-a" in Directory.named).toBe(false);
    expect(Directory.named["afn-surveys/user-1/org-b"]).toEqual(["answers-r-2.sealed"]);
    expect(secureStorage.set).toHaveBeenCalledWith("afn.surveys.scopes", JSON.stringify([OTHER_ORG]));
    // Only survey keys: assisted-enrollment drafts (afn.assisted.*) are never touched.
    const touched = [...(secureStorage.remove as jest.Mock).mock.calls, ...(secureStorage.set as jest.Mock).mock.calls].map(([key]) => key as string);
    expect(touched.every((key) => key.startsWith("afn.surveys."))).toBe(true);
  });
});
