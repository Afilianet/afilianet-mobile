import { ApiError } from "../../api/errors";
import { strings } from "../../i18n";
import { openJson, sealJson, type SurveyScope } from "./vault";

/**
 * Where a survey record belongs (docs/AISLAMIENTO_ORIGEN_ENCUESTAS_ES.md).
 *
 * - "fixture": the sample data; it never leaves the phone.
 * - "api:<scheme>://<host>[:port][/path]": one real server, from the API base
 *   URL, normalized so the same server always yields the same identity.
 * - "unconfirmed": a record stored before origins existed whose origin cannot
 *   be proven. It is never sent anywhere automatically.
 *
 * A record is only ever sent by a source whose origin is EXACTLY its own, and
 * its origin is set once, when it is created; nothing relabels it.
 */
export type SurveyOrigin = string;
/** What a record stored before origins existed can be classified as: never a server. */
export type LegacyOrigin = typeof FIXTURE_ORIGIN | typeof UNCONFIRMED_ORIGIN;

export const FIXTURE_ORIGIN = "fixture";
export const UNCONFIRMED_ORIGIN = "unconfirmed";
const UNCONFIGURED_API = "api:unconfigured";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const DEFAULT_PORTS: Record<string, string> = { http: "80", https: "443" };

/** API contract: every surveys identifier (version, response, audio, client_response_id) is a UUID; case does not matter. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Stable identity of one API server: scheme, lowercase host, non-default port and path, nothing else. */
export function apiOrigin(baseUrl: string): SurveyOrigin {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(\[[^\]/?#]+\]|[^:/?#]+)(?::(\d*))?([^?#]*)/i.exec(baseUrl.trim());
  if (!match) return UNCONFIGURED_API;
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase().replace(/\.$/, "");
  const port = match[3] && match[3] !== DEFAULT_PORTS[scheme] ? `:${match[3]}` : "";
  const path = match[4].replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return host ? `api:${scheme}://${host}${port}${path}` : UNCONFIGURED_API;
}

/**
 * A short, storage-safe key for an origin (file names only allow [A-Za-z0-9_-]):
 * "fixture", or "api-" + an FNV-1a hash of the identity. Stable across runs.
 */
export function originStorageKey(origin: SurveyOrigin): string {
  if (origin === FIXTURE_ORIGIN) return FIXTURE_ORIGIN;
  let hash = 0x811c9dc5;
  for (let index = 0; index < origin.length; index += 1) {
    hash ^= origin.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `api-${hash.toString(16).padStart(8, "0")}`;
}

/** Whether a source with this origin may send anything at all. */
export function isSendableOrigin(origin: SurveyOrigin | undefined): origin is SurveyOrigin {
  return origin === FIXTURE_ORIGIN || (typeof origin === "string" && origin.startsWith("api:") && origin !== UNCONFIGURED_API);
}

/** The host (and port) of an API origin, for people; null for anything else. */
export function originHost(origin: SurveyOrigin): string | null {
  const match = /^api:[a-z0-9+.-]+:\/\/([^/]+)/.exec(origin);
  return match ? match[1] : null;
}

/**
 * Refused on the phone, before any request: an identifier the contract
 * requires as a UUID is not one (e.g. a sample-data id). The record is kept
 * and shows why; it is never discarded.
 */
/** Known Afilianet servers, by origin; any other server is named by its host. */
const KNOWN_SERVERS: Readonly<Record<string, "staging" | "production">> = {
  "api:https://staging-api.afilianet.mx": "staging",
  "api:https://api.afilianet.mx": "production",
};

/** How an origin is named to people: no scheme, path or ids unless it is an unknown server (then its host). */
export function describeOrigin(origin: SurveyOrigin): string {
  const copy = strings.surveys.origin;
  if (origin === FIXTURE_ORIGIN) return copy.fixture;
  const known = has(KNOWN_SERVERS, origin) ? KNOWN_SERVERS[origin] : undefined;
  if (known) return copy[known];
  const host = originHost(origin);
  return host && isSendableOrigin(origin) ? copy.server(host) : copy.unconfirmed;
}

export class InvalidIdentifierError extends ApiError {
  constructor(readonly field: "version" | "client_response_id" | "response") {
    super("validation", "Identificador no válido para el servidor.", null, undefined, { reason: "invalid_identifier" });
    this.name = "InvalidIdentifierError";
  }
}

export function isInvalidIdentifierError(error: unknown): error is InvalidIdentifierError {
  return error instanceof InvalidIdentifierError;
}

export class OriginMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginMismatchError";
  }
}

/**
 * The sample data's ids through its whole history (git log of fixtureSource.ts):
 * version id -> survey id. Real ids are UUIDs, so only these exact pairs prove
 * a record without an origin was sample data.
 */
const HISTORICAL_FIXTURE_VERSIONS: Readonly<Record<string, string>> = {
  "fx-v-servicio-2": "fx-servicio",
  "fx-v-vecinal-1": "fx-vecinal",
  "fx-v-cerrada-1": "fx-cerrada",
};

/** Classification of a record stored before origins existed. A UUID alone never proves staging or production. */
export function legacyOrigin(surveyId: unknown, versionId: unknown): LegacyOrigin {
  return typeof versionId === "string" && has(HISTORICAL_FIXTURE_VERSIONS, versionId) && HISTORICAL_FIXTURE_VERSIONS[versionId] === surveyId
    ? FIXTURE_ORIGIN
    : UNCONFIRMED_ORIGIN;
}

/** A cached inbox is sample data only when every entry is a known sample pair. */
export function legacyInboxOrigin(surveys: { survey_id?: unknown; id?: unknown }[] | undefined): LegacyOrigin {
  if (!Array.isArray(surveys) || surveys.length === 0) return UNCONFIRMED_ORIGIN;
  return surveys.every((survey) => legacyOrigin(survey?.survey_id, survey?.id) === FIXTURE_ORIGIN) ? FIXTURE_ORIGIN : UNCONFIRMED_ORIGIN;
}

/**
 * The classification of records stored before origins existed, written once
 * per account+organization by the upgrade (originUpgrade.ts). It is a separate
 * file: no existing record is rewritten, so an interrupted upgrade loses
 * nothing. Entries are write-once and can only be "fixture" or "unconfirmed";
 * anything else in the file is ignored, so it can never make a record
 * sendable to a server.
 */
const LEDGER = "origins";

export type OriginLedger = Readonly<Record<string, LegacyOrigin>>;

export const ledgerKey = {
  draft: (id: string) => `draft:${id}`,
  outbox: (id: string) => `outbox:${id}`,
  receipt: (id: string) => `receipt:${id}`,
  version: (surveyId: string) => `version:${surveyId}`,
  audio: (clientAudioId: string) => `audio:${clientAudioId}`,
  inbox: "inbox",
};

/** Never throws: a missing or unreadable ledger is empty, and records are then classified live (same rules). */
export async function readOriginLedger(scope: SurveyScope): Promise<OriginLedger> {
  try {
    const stored = await openJson<{ entries?: Record<string, unknown> }>(scope, LEDGER);
    const entries: Record<string, LegacyOrigin> = {};
    for (const [key, value] of Object.entries(stored?.entries ?? {})) {
      if (value === FIXTURE_ORIGIN || value === UNCONFIRMED_ORIGIN) entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

/** Adds entries that are not there yet; existing ones are never changed. Returns how many were added. */
export async function addToOriginLedger(scope: SurveyScope, entries: Record<string, LegacyOrigin>): Promise<number> {
  const current = await readOriginLedger(scope);
  const added = Object.entries(entries).filter(([key]) => !has(current, key));
  if (!added.length) return 0;
  await sealJson(scope, LEDGER, { version: 1, entries: { ...current, ...Object.fromEntries(added) } });
  return added.length;
}

/** The record's own origin, else the ledger's classification, else the same classification computed now. */
export function resolveOrigin(stamped: unknown, ledger: OriginLedger, key: string, classify: () => LegacyOrigin): SurveyOrigin {
  if (typeof stamped === "string" && stamped) return stamped;
  return ledger[key] ?? classify();
}
