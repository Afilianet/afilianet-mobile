import { captureApiSessionGuard } from "../../api/client";
import { ApiError } from "../../api/errors";
import { createFixtureSurveySource } from "./fixtureSource";
import {
  discardRejectedAudio,
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

// NOTE: these exercise the device queue against the contract's rules (API
// feat/survey-module @ aa94798) through the sample source. They do NOT
// validate the surveys MVP end to end against a real server.

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
const SELF_VERSION = "fx-v-servicio-2";
const INTERVIEW_VERSION = "fx-v-vecinal-1";

let online = true;
let source: ReturnType<typeof createFixtureSurveySource>;

function selfItem(id: string, overrides: Partial<Omit<OutboxItem, "attempts">> = {}): Omit<OutboxItem, "attempts"> & { origin: string } {
  return {
    id,
    origin: "fixture",
    surveyId: "fx-servicio",
    versionId: SELF_VERSION,
    surveyTitle: "Satisfacción",
    respondentType: "self",
    consentAudio: null,
    completedAt: "2026-10-12T10:00:00Z",
    audio: null,
    ...overrides,
  };
}

async function interviewWithAudio(scope: SurveyScope, id: string, clientAudioId: string, overrides: { bytes?: number; consent?: "accepted" | "declined" } = {}) {
  await sealBytes(scope, `audio-${clientAudioId}`, new Uint8Array([1, 2, 3, 4]));
  return enqueueResponse(
    scope,
    selfItem(id, {
      surveyId: "fx-vecinal",
      versionId: INTERVIEW_VERSION,
      respondentType: "interviewed_external",
      consentAudio: overrides.consent ?? "accepted",
      audio: { clientAudioId, mimeType: "audio/mp4", durationMs: 4000, interrupted: false, bytes: overrides.bytes ?? 4 },
    }),
    [{ question_id: 1, value_choice_ids: [1] }],
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
    const saved = await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    expect(displayState(saved)).toBe("saved");

    online = false;
    await syncOutbox(ORG_A, source);
    expect(displayState((await listOutbox(ORG_A))[0])).toBe("pending_sync");

    online = true;
    await interviewWithAudio(ORG_A, "r-2", "aud-2");
    jest.spyOn(source, "uploadAudio").mockRejectedValueOnce(new ApiError("server", "boom", 500));
    await syncOutbox(ORG_A, source, { force: true });

    const remaining = await listOutbox(ORG_A);
    expect(remaining.map((value) => [value.id, displayState(value)])).toEqual([["r-2", "audio_pending"]]);
    expect((await listReceipts(ORG_A)).map((receipt) => receipt.id)).toEqual(["r-1"]);
  });

  it("sends every answer set before any audio, with the contract's fields", async () => {
    const calls: string[] = [];
    const submit = source.submitResponse.bind(source);
    const upload = source.uploadAudio.bind(source);
    const tracked: SurveySource = {
      ...source,
      submitResponse: async (org, versionId, submission) => {
        calls.push(`answers:${submission.client_response_id}`);
        expect(submission).toMatchObject({ respondent_type: "interviewed_external", consent_audio: "accepted", consent_version: versionId });
        return submit(org, versionId, submission);
      },
      uploadAudio: async (org, input, assertCurrent) => {
        calls.push(`audio:${input.responseId.slice(0, 5)}`);
        expect(input).toMatchObject({ mimeType: "audio/mp4", durationSeconds: 4, interrupted: false });
        return upload(org, input, assertCurrent);
      },
    };
    await interviewWithAudio(ORG_A, "r-1", "aud-1");
    await interviewWithAudio(ORG_A, "r-2", "aud-2");
    await syncOutbox(ORG_A, tracked);

    expect(calls).toEqual(["answers:r-1", "answers:r-2", "audio:fx-r-", "audio:fx-r-"]);
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("is idempotent when a reply is lost: the resend gets the original response, never a duplicate", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    const submit = source.submitResponse.bind(source);
    const ids: string[] = [];
    jest.spyOn(source, "submitResponse").mockImplementationOnce(async (org, versionId, submission) => {
      ids.push((await submit(org, versionId, submission)).id);
      throw new ApiError("timeout", "lost reply");
    });
    await syncOutbox(ORG_A, source);
    expect(await listOutbox(ORG_A)).toHaveLength(1);
    expect(hasItem(ORG_A, "answers-r-1")).toBe(true);

    jest.spyOn(source, "submitResponse").mockImplementation(async (org, versionId, submission) => {
      const receipt = await submit(org, versionId, submission);
      ids.push(receipt.id);
      return receipt;
    });
    await syncOutbox(ORG_A, source, { force: true });

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("keeps the local copy until the server confirms it", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1");
    jest.spyOn(source, "uploadAudio").mockRejectedValueOnce(new ApiError("server", "boom", 500));
    await syncOutbox(ORG_A, source);

    expect(hasItem(ORG_A, "answers-r-1")).toBe(false); // answers confirmed -> removed
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true); // audio not confirmed -> kept
    await syncOutbox(ORG_A, source, { force: true });
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(false);
  });

  it("never uploads audio when the consent was declined, and deletes the local recording", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1", { consent: "declined" });
    const upload = jest.spyOn(source, "uploadAudio");
    await syncOutbox(ORG_A, source);
    expect(upload).not.toHaveBeenCalled();
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(false);
    expect((await listReceipts(ORG_A))[0]).toMatchObject({ id: "r-1", withAudio: false });
  });

  it("reads the audio limits from the server and keeps a too-large audio until the person discards it", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1", { bytes: 16 * 1024 * 1024 });
    const upload = jest.spyOn(source, "uploadAudio");
    await syncOutbox(ORG_A, source);

    const [item] = await listOutbox(ORG_A);
    expect(displayState(item)).toBe("audio_rejected");
    expect(item.audio?.rejected).toBe("object_too_large");
    expect(upload).not.toHaveBeenCalled();
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true);

    await discardRejectedAudio(ORG_A, "r-1");
    expect(await listOutbox(ORG_A)).toEqual([]);
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(false);
    expect((await listReceipts(ORG_A))[0]).toMatchObject({ id: "r-1", withAudio: false });
  });

  it("stops in airplane mode, backs off, and retries on demand", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), []);
    await enqueueResponse(ORG_A, selfItem("r-2"), []);
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

  it("closed while offline: 422 survey_version_closed blocks and KEEPS it, never retried, discarded only on request", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    await source.setClosed(SELF_VERSION, true);
    await syncOutbox(ORG_A, source);

    const [blocked] = await listOutbox(ORG_A);
    expect(displayState(blocked)).toBe("blocked");
    expect(blocked.blocked).toBe("survey_version_closed");
    expect(hasItem(ORG_A, "answers-r-1")).toBe(true);

    const spy = jest.spyOn(source, "submitResponse");
    await syncOutbox(ORG_A, source, { force: true });
    expect(spy).not.toHaveBeenCalled();

    await discardResponse(ORG_A, "r-1");
    expect(await listOutbox(ORG_A)).toEqual([]);
    expect(hasItem(ORG_A, "answers-r-1")).toBe(false);
  });

  // API #66 (merged 2026-10-19): survey routes require the active organization
  // (400 without X-Organization-ID) and answer 404 for anything outside it.
  it("API #66: a 404 for the version blocks and KEEPS the response, never retried automatically, discarded only on request", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    const spy = jest.spyOn(source, "submitResponse").mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
    await syncOutbox(ORG_A, source);

    const [blocked] = await listOutbox(ORG_A);
    expect(displayState(blocked)).toBe("blocked");
    expect(blocked.blocked).toBe("version_unavailable");
    expect(hasItem(ORG_A, "answers-r-1")).toBe(true);

    spy.mockClear();
    await syncOutbox(ORG_A, source, { force: true });
    expect(spy).not.toHaveBeenCalled();
    expect(await listReceipts(ORG_A)).toEqual([]);

    await discardResponse(ORG_A, "r-1");
    expect(await listOutbox(ORG_A)).toEqual([]);
  });

  it("API #66: a 400 (no active organization) is not a definitive rejection: kept pending and retried later, never blocked", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    jest.spyOn(source, "submitResponse").mockRejectedValueOnce(new ApiError("unknown", "The X-Organization-ID header is required.", 400));
    await syncOutbox(ORG_A, source);
    const [pending] = await listOutbox(ORG_A);
    expect(pending.blocked).toBeUndefined();
    expect(displayState(pending)).toBe("pending_sync");

    // The submission is idempotent (client_response_id): the retry lands once.
    await syncOutbox(ORG_A, source, { force: true });
    expect(await listOutbox(ORG_A)).toEqual([]);
    expect(await listReceipts(ORG_A)).toHaveLength(1);
  });

  it("API #66: a 404 for the audio's response marks the audio not accepted (answers received), never reported as completed nor retried", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1");
    const upload = jest.spyOn(source, "uploadAudio").mockRejectedValue(new ApiError("not_found", "Not Found.", 404));
    await syncOutbox(ORG_A, source);

    const [item] = await listOutbox(ORG_A);
    expect(item.responseId).toBeTruthy();
    expect(item.audio?.rejected).toBe("response_unavailable");
    expect(displayState(item)).toBe("audio_rejected");
    expect(await listReceipts(ORG_A)).toEqual([]);
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true);

    upload.mockClear();
    await syncOutbox(ORG_A, source, { force: true });
    expect(upload).not.toHaveBeenCalled();
  });

  // A 403 names a specific cause only when the server CONFIRMS it with a
  // contract `reason`. Without one (the deployed API d4cec70 and #67 send
  // none) or with an unknown one, the cause is not known: a neutral block,
  // data kept. The server's message text is never used to classify.
  describe("403 on submit: specific only with a confirmed reason", () => {
    it.each([
      ["recognized reason not_assigned_surveyor (API #68)", "interview", { reason: "not_assigned_surveyor" }, "not_assigned_surveyor"],
      ["recognized reason no_affiliate_profile (API #68)", "self", { reason: "no_affiliate_profile" }, "not_a_member"],
      // A confirmed reason wins over the modality: no inference either way.
      ["recognized no_affiliate_profile on an interview", "interview", { reason: "no_affiliate_profile" }, "not_a_member"],
      ["no reason, interview", "interview", {}, "forbidden"],
      ["no reason, self response", "self", {}, "forbidden"],
      ["unknown reason", "interview", { reason: "something_new" }, "forbidden"],
    ] as const)("%s", async (_label, mode, extra, expected) => {
      if (mode === "interview") await interviewWithAudio(ORG_A, "r-1", "aud-1");
      else await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
      // The message even claims a cause; it must not be what decides.
      const error = new ApiError("forbidden", "No estás asignado como encuestador en esta organización.", 403, undefined, extra);
      const submit = jest.spyOn(source, "submitResponse").mockRejectedValueOnce(error);
      await syncOutbox(ORG_A, source);

      const [item] = await listOutbox(ORG_A);
      expect(item.blocked).toBe(expected);
      expect(hasItem(ORG_A, "answers-r-1")).toBe(true);
      if (mode === "interview") expect(hasItem(ORG_A, "audio-aud-1")).toBe(true);
      // Blocked: never resent automatically.
      submit.mockClear();
      await syncOutbox(ORG_A, source, { force: true });
      expect(submit).not.toHaveBeenCalled();
      expect(await listReceipts(ORG_A)).toEqual([]);
    });
  });

  it("a persistent server error never turns into continuous requests: automatic syncs wait a growing backoff, and nothing is duplicated", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), [{ question_id: 1, value_choice_ids: [1] }]);
    const submit = jest.spyOn(source, "submitResponse").mockRejectedValue(new ApiError("server", "Server Error", 500));
    let clock = 1_000_000;
    const now = () => clock;

    await syncOutbox(ORG_A, source, { now });
    expect(submit).toHaveBeenCalledTimes(1);
    // Automatic syncs (focus, foreground, the 60 s timer) before the backoff ends send nothing.
    for (const elapsed of [0, 1_000, 4_999]) {
      clock = 1_000_000 + elapsed;
      await syncOutbox(ORG_A, source, { now });
    }
    expect(submit).toHaveBeenCalledTimes(1);

    clock = 1_000_000 + 5_000; // first backoff (5 s) elapsed
    await syncOutbox(ORG_A, source, { now });
    expect(submit).toHaveBeenCalledTimes(2);
    const [afterTwo] = await listOutbox(ORG_A);
    expect(afterTwo.attempts).toBe(2);
    expect(afterTwo.nextAttemptAt).toBe(clock + 10_000); // doubled

    // It keeps growing and is capped at 10 minutes.
    for (let index = 0; index < 12; index += 1) {
      const [current] = await listOutbox(ORG_A);
      clock = current.nextAttemptAt!;
      await syncOutbox(ORG_A, source, { now });
    }
    const [capped] = await listOutbox(ORG_A);
    expect(capped.nextAttemptAt! - clock).toBe(10 * 60_000);
    // One outbox entry and no receipt: never duplicated, never "Recibido".
    expect(await listOutbox(ORG_A)).toHaveLength(1);
    expect(await listReceipts(ORG_A)).toEqual([]);
  });

  it("blocks an interview from someone who is no longer an assigned surveyor", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1");
    jest.spyOn(source, "submitResponse").mockRejectedValueOnce(new ApiError("forbidden", "x", 403, undefined, { reason: "not_assigned_surveyor" }));
    await syncOutbox(ORG_A, source);
    const [item] = await listOutbox(ORG_A);
    expect(item.blocked).toBe("not_assigned_surveyor");
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true);
  });

  it("stops before the next request when the session or organization changes mid-sync", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), []);
    await enqueueResponse(ORG_A, selfItem("r-2"), []);
    let current = true;
    guard.mockReturnValue(() => current);
    const spy = jest.spyOn(source, "submitResponse").mockImplementation(async (org, versionId, submission) => {
      current = false; // signed out / switched while the first request was in flight
      return createFixtureSurveySource(async () => undefined).submitResponse(org, versionId, submission);
    });
    const result = await syncOutbox(ORG_A, source);

    expect(result.stoppedReason).toBe("session_changed");
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await listOutbox(ORG_A)).map((value) => value.id)).toEqual(["r-1", "r-2"]); // reply not trusted under the new session
    expect(guard).toHaveBeenCalledWith("org-a");
  });

  it("sign-out during an audio upload: nothing is confirmed afterwards, the recording stays, and the retry neither duplicates the answers nor the audio", async () => {
    await interviewWithAudio(ORG_A, "r-1", "aud-1");
    let current = true;
    guard.mockReturnValue(() => current);
    const submit = jest.spyOn(source, "submitResponse");
    const realUpload = source.uploadAudio.bind(source);
    const upload = jest.spyOn(source, "uploadAudio").mockImplementationOnce(async (org, input, assertCurrent) => {
      assertCurrent(); // upload session opened under the original account...
      current = false; // ...then signed out while the bytes were going up
      assertCurrent(); // the confirmation step must not go out
    });

    const stopped = await syncOutbox(ORG_A, source);
    expect(stopped.stoppedReason).toBe("session_changed");
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(true);
    expect((await listOutbox(ORG_A)).map((value) => [value.id, displayState(value)])).toEqual([["r-1", "audio_pending"]]);
    expect(await listReceipts(ORG_A)).toEqual([]);

    // Back in the same account: only the audio is retried, from a new upload session.
    current = true;
    upload.mockImplementation(realUpload);
    await syncOutbox(ORG_A, source, { force: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(hasItem(ORG_A, "audio-aud-1")).toBe(false);
    expect((await listReceipts(ORG_A)).map((receipt) => [receipt.id, receipt.withAudio])).toEqual([["r-1", true]]);
  });

  it("never lists, sends or reports one account's or organization's pending items for another", async () => {
    await enqueueResponse(ORG_A, selfItem("a-1"), []);
    await enqueueResponse(ORG_B, selfItem("b-1"), []);
    await enqueueResponse(OTHER_USER, selfItem("u2-1"), []);
    const spy = jest.spyOn(source, "submitResponse");

    await syncOutbox(ORG_B, source);
    expect(spy.mock.calls.map(([org, , submission]) => [org, submission.client_response_id])).toEqual([["org-b", "b-1"]]);
    expect((await listOutbox(ORG_A)).map((value) => value.id)).toEqual(["a-1"]);

    const pending = await pendingForAccount("user-1");
    expect(pending.map(({ scope, items }) => [scope.organizationId, items.map((value) => value.id)])).toEqual([["org-a", ["a-1"]]]);
    expect((await pendingForAccount("user-2"))[0].items.map((value) => value.id)).toEqual(["u2-1"]);
  });

  it("does not double-send when a second sync starts while one is running", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), []);
    const spy = jest.spyOn(source, "submitResponse");
    await Promise.all([syncOutbox(ORG_A, source), syncOutbox(ORG_A, source)]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not create a second outbox entry when the same response is saved twice (double tap)", async () => {
    await enqueueResponse(ORG_A, selfItem("r-1"), []);
    await enqueueResponse(ORG_A, selfItem("r-1"), []);
    expect(await listOutbox(ORG_A)).toHaveLength(1);
  });
});
