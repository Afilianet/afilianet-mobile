import { captureApiSessionGuard } from "../../api/client";
import { ApiError } from "../../api/errors";
import { createFixtureSurveySource } from "./fixtureSource";
import {
  discardResponse,
  displayState,
  enqueueResponse,
  listOutbox,
  listReceipts,
  pendingForAccount,
  syncOutbox,
  type OutboxItem,
} from "./outbox";
import type { SurveySource } from "./source";
import { hasItem, sealBytes, type SurveyScope } from "./vault";

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test" } }));
jest.mock("../../api/client", () => ({ captureApiSessionGuard: jest.fn() }));

// In-memory stand-in for the sealed vault: same API, same per-scope isolation.
jest.mock("./vault", () => {
  const files = new Map<string, Uint8Array>();
  const scopes: { userId: string; organizationId: string }[] = [];
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  const remember = (scope: { userId: string; organizationId: string }) => {
    if (!scopes.some((value) => value.userId === scope.userId && value.organizationId === scope.organizationId)) scopes.push({ ...scope });
  };
  return {
    __files: files,
    __scopes: scopes,
    listScopes: jest.fn(async () => [...scopes]),
    sealBytes: jest.fn(async (scope, name: string, bytes: Uint8Array) => {
      remember(scope);
      files.set(key(scope, name), bytes);
      return bytes.byteLength;
    }),
    openBytes: jest.fn(async (scope, name: string) => files.get(key(scope, name)) ?? null),
    sealJson: jest.fn(async (scope, name: string, value: unknown) => {
      remember(scope);
      files.set(key(scope, name), new TextEncoder().encode(JSON.stringify(value)));
    }),
    openJson: jest.fn(async (scope, name: string) => {
      const bytes = files.get(key(scope, name));
      return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    }),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
    hasItem: jest.fn((scope, name: string) => files.has(key(scope, name))),
  };
});

const vaultMock = jest.requireMock("./vault") as { __files: Map<string, Uint8Array>; __scopes: SurveyScope[] };
const guard = captureApiSessionGuard as jest.Mock;

const ORG_A: SurveyScope = { userId: "user-1", organizationId: "org-a" };
const ORG_B: SurveyScope = { userId: "user-1", organizationId: "org-b" };
const OTHER_USER: SurveyScope = { userId: "user-2", organizationId: "org-a" };

let online = true;
let source: ReturnType<typeof createFixtureSurveySource>;

function item(id: string, overrides: Partial<Omit<OutboxItem, "attempts">> = {}): Omit<OutboxItem, "attempts"> {
  return {
    id,
    surveyId: "fx-servicio",
    versionId: "fx-v-servicio-2",
    surveyTitle: "Satisfacción",
    modality: "self_administered",
    respondentLabel: null,
    completedAt: "2026-10-12T10:00:00Z",
    recordingConsent: false,
    audio: null,
    ...overrides,
  };
}

async function withAudio(scope: SurveyScope, id: string, clientAudioId: string) {
  await sealBytes(scope, `audio-${clientAudioId}`, new Uint8Array([1, 2, 3, 4]));
  return enqueueResponse(
    scope,
    item(id, {
      surveyId: "fx-vecinal",
      versionId: "fx-v-vecinal-1",
      modality: "interviewer",
      recordingConsent: true,
      audio: { clientAudioId, mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: 4 },
    }),
    [{ question_id: "q1", value: "a" }],
  );
}

beforeEach(async () => {
  vaultMock.__files.clear();
  vaultMock.__scopes.length = 0;
  online = true;
  guard.mockReset();
  guard.mockReturnValue(() => true);
  source = createFixtureSurveySource(async () => {
    if (!online) throw new ApiError("offline", "Sin conexión.");
  });
  await source.reset();
});

describe("survey outbox", () => {
  it("shows distinct states: saved on device, pending sync, audio pending, and a separate receipt once received", async () => {
    const saved = await enqueueResponse(ORG_A, item("r-1"), [{ question_id: "q1", value: "a" }]);
    expect(displayState(saved)).toBe("saved");

    online = false;
    await syncOutbox(ORG_A, source);
    expect(displayState((await listOutbox(ORG_A))[0])).toBe("pending_sync");

    online = true;
    await withAudio(ORG_A, "r-2", "aud-2");
    jest.spyOn(source, "uploadAudio").mockRejectedValueOnce(new ApiError("server", "boom", 500));
    await syncOutbox(ORG_A, source, { force: true });

    const remaining = await listOutbox(ORG_A);
    expect(remaining.map((value) => [value.id, displayState(value)])).toEqual([["r-2", "audio_pending"]]);
    expect((await listReceipts(ORG_A)).map((receipt) => receipt.id)).toEqual(["r-1"]);
  });

  it("sends every answer set before any audio", async () => {
    const calls: string[] = [];
    const tracked: SurveySource = {
      ...source,
      submitResponse: async (org, submission) => {
        calls.push(`answers:${submission.client_response_id}`);
        return source.submitResponse(org, submission);
      },
      uploadAudio: async (org, input) => {
        calls.push(`audio:${input.client_audio_id}`);
        return source.uploadAudio(org, input);
      },
    };
    await withAudio(ORG_A, "r-1", "aud-1");
    await withAudio(ORG_A, "r-2", "aud-2");
    await syncOutbox(ORG_A, tracked);

    expect(calls).toEqual(["answers:r-1", "answers:r-2", "audio:aud-1", "audio:aud-2"]);
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("is idempotent when a reply is lost: the resend gets the same server response and no duplicate", async () => {
    await enqueueResponse(ORG_A, item("r-1"), [{ question_id: "q1", value: "a" }]);
    const submit = source.submitResponse.bind(source);
    const ids: string[] = [];
    jest.spyOn(source, "submitResponse").mockImplementationOnce(async (org, submission) => {
      ids.push((await submit(org, submission)).response_id);
      throw new ApiError("timeout", "lost reply");
    });
    await syncOutbox(ORG_A, source);
    expect(await listOutbox(ORG_A)).toHaveLength(1);
    expect(hasItem(ORG_A, "answers-r-1")).toBe(true);

    const spy = jest.spyOn(source, "submitResponse");
    spy.mockImplementation(async (org, submission) => {
      const receipt = await submit(org, submission);
      ids.push(receipt.response_id);
      return receipt;
    });
    await syncOutbox(ORG_A, source, { force: true });

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("keeps the local copy until the server confirms it", async () => {
    await withAudio(ORG_A, "r-1", "aud-1");
    jest.spyOn(source, "uploadAudio").mockRejectedValueOnce(new ApiError("server", "boom", 500));
    await syncOutbox(ORG_A, source);

    expect(hasItem(ORG_A, "answers-r-1")).toBe(false); // answers confirmed -> removed
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true); // audio not confirmed -> kept
    await syncOutbox(ORG_A, source, { force: true });
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(false);
  });

  it("stops in airplane mode, backs off, and retries on demand", async () => {
    await enqueueResponse(ORG_A, item("r-1"), []);
    await enqueueResponse(ORG_A, item("r-2"), []);
    online = false;
    const spy = jest.spyOn(source, "submitResponse");
    const result = await syncOutbox(ORG_A, source, { now: () => 1_000 });

    expect(result.stoppedReason).toBe("offline");
    expect(spy).toHaveBeenCalledTimes(1); // no point hammering the rest while offline
    const [first] = await listOutbox(ORG_A);
    expect(first.attempts).toBe(1);
    expect(first.nextAttemptAt).toBe(6_000);

    online = true;
    await syncOutbox(ORG_A, source, { now: () => 2_000 });
    expect((await listOutbox(ORG_A)).map((value) => value.id)).toEqual(["r-1"]); // r-1 still backing off
    await syncOutbox(ORG_A, source, { force: true });
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("keeps a response whose survey closed, and only discards it when the person decides", async () => {
    await enqueueResponse(ORG_A, item("r-1"), [{ question_id: "q1", value: "a" }]);
    await source.setClosed("fx-servicio", true);
    await syncOutbox(ORG_A, source);

    const [blocked] = await listOutbox(ORG_A);
    expect(displayState(blocked)).toBe("blocked");
    expect(hasItem(ORG_A, "answers-r-1")).toBe(true);
    await syncOutbox(ORG_A, source, { force: true });
    expect(await listOutbox(ORG_A)).toHaveLength(1);

    await discardResponse(ORG_A, "r-1");
    expect(await listOutbox(ORG_A)).toEqual([]);
    expect(hasItem(ORG_A, "answers-r-1")).toBe(false);
  });

  it("stops before the next request when the session or organization changes mid-sync", async () => {
    await enqueueResponse(ORG_A, item("r-1"), []);
    await enqueueResponse(ORG_A, item("r-2"), []);
    let current = true;
    guard.mockReturnValue(() => current);
    const spy = jest.spyOn(source, "submitResponse").mockImplementation(async (org, submission) => {
      current = false; // signed out / switched while the first request was in flight
      return createFixtureSurveySource(async () => undefined).submitResponse(org, submission);
    });
    const result = await syncOutbox(ORG_A, source);

    expect(result.stoppedReason).toBe("session_changed");
    expect(spy).toHaveBeenCalledTimes(1);
    const remaining = await listOutbox(ORG_A);
    expect(remaining.map((value) => value.id)).toEqual(["r-1", "r-2"]); // reply not trusted under the new session
    expect(guard).toHaveBeenCalledWith("org-a");
  });

  it("never lists, sends or reports one account's or organization's pending items for another", async () => {
    await enqueueResponse(ORG_A, item("a-1"), []);
    await enqueueResponse(ORG_B, item("b-1"), []);
    await enqueueResponse(OTHER_USER, item("u2-1"), []);
    const spy = jest.spyOn(source, "submitResponse");

    await syncOutbox(ORG_B, source);
    expect(spy.mock.calls.map(([org, submission]) => [org, submission.client_response_id])).toEqual([["org-b", "b-1"]]);
    expect((await listOutbox(ORG_A)).map((value) => value.id)).toEqual(["a-1"]);

    const pending = await pendingForAccount("user-1");
    expect(pending.map(({ scope, items }) => [scope.organizationId, items.map((value) => value.id)])).toEqual([["org-a", ["a-1"]]]);
    expect((await pendingForAccount("user-2"))[0].items.map((value) => value.id)).toEqual(["u2-1"]);
  });

  it("does not double-send when a second sync starts while one is running", async () => {
    await enqueueResponse(ORG_A, item("r-1"), []);
    const spy = jest.spyOn(source, "submitResponse");
    await Promise.all([syncOutbox(ORG_A, source), syncOutbox(ORG_A, source)]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not create a second outbox entry when the same response is saved twice (double tap)", async () => {
    await enqueueResponse(ORG_A, item("r-1"), []);
    await enqueueResponse(ORG_A, item("r-1"), []);
    expect(await listOutbox(ORG_A)).toHaveLength(1);
  });
});
