import type { Breadcrumb, ErrorEvent, Event, ReactNativeOptions, TransactionEvent } from "@sentry/react-native";

type SpanJSON = Parameters<NonNullable<ReactNativeOptions["beforeSendSpan"]>>[0];

/**
 * Removes secrets and personal data from everything Sentry would send.
 *
 * Invitation and staff-invitation tokens and referral codes travel in URL
 * paths (src/api/endpoints.ts, src/app/join, src/app/staff-invite), the
 * organization search travels in `?q=`, and error messages can quote any of
 * them. Routes keep their shape ("/api/v1/invitations/:token/accept") so
 * reports stay groupable; values never leave the device.
 */

export const FILTERED = "[Filtered]";

// The segment(s) that follow these path segments are secrets or personal codes.
const SECRET_AFTER: Record<string, string[]> = {
  invitations: [":token"],
  "staff-invitations": [":token"],
  "staff-invite": [":token"],
  referrals: [":code"],
  join: [":id", ":code"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^\d+$/;
const OPAQUE = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9._~%-]{16,}$/;
const LONG_TOKEN = /^[A-Za-z0-9_-]{24,}$/;

function normalizeSegment(segment: string): string {
  if (!segment || segment.startsWith(":")) return segment;
  if (segment.includes("@") || segment.includes("%40")) return ":email";
  if (UUID.test(segment) || NUMBER.test(segment)) return ":id";
  if (OPAQUE.test(segment) || LONG_TOKEN.test(segment)) return ":token";
  return segment;
}

export function normalizePath(path: string): string {
  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const placeholders = SECRET_AFTER[segments[index].toLowerCase()];
    if (placeholders) {
      placeholders.forEach((placeholder, offset) => {
        if (segments[index + 1 + offset]) segments[index + 1 + offset] = placeholder;
      });
      index += placeholders.length;
    } else {
      segments[index] = normalizeSegment(segments[index]);
    }
  }
  return segments.join("/");
}

const URL_PARTS = /^([a-z][a-z0-9+.-]*:\/\/)?([^/?#]*@)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

/** Keeps scheme, host and the normalized path; drops credentials, the query and the fragment. */
export function scrubUrl(url: string): string {
  const parts = URL_PARTS.exec(url);
  if (!parts) return FILTERED;
  const [, scheme = "", , host = "", path = "", query] = parts;
  const queryMarker = query ? `?${FILTERED}` : "";
  // Only http(s) has a real host. In "afilianetmobile://join/…" or a relative
  // "api/v1/…" the "host" is the route's first segment.
  if (/^https?:\/\/$/i.test(scheme)) return `${scheme}${host}${normalizePath(path)}${queryMarker}`;
  return `${scheme}${normalizePath(`${host}${path}`)}${queryMarker}`;
}

const ABSOLUTE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)]+/gi;
const APP_PATH = /(^|[\s"'(`=])(\/(?:api\/v\d+|join|staff-invite|invitations|staff-invitations)\/[^\s"'<>`)]*)/g;
const BEARER = /\bBearer\s+[^\s"',]+/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(^|[^\w.:/-])(\+?\d(?:[ -]?\d){9,14})(?![\w.:/-])/g;
const UUID_IN_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const TOKEN_IN_TEXT = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;

/** Free text (messages, exception values, labels): URLs normalized, credentials and contact data removed. */
export function scrubText(text: string): string {
  return text
    .replace(BEARER, `Bearer ${FILTERED}`)
    .replace(JWT, FILTERED)
    .replace(ABSOLUTE_URL, (url) => scrubUrl(url))
    .replace(APP_PATH, (_, prefix: string, path: string) => `${prefix}${scrubUrl(path)}`)
    .replace(EMAIL, "[email]")
    .replace(PHONE, (_, prefix: string) => `${prefix}[phone]`)
    .replace(UUID_IN_TEXT, ":id")
    .replace(TOKEN_IN_TEXT, FILTERED);
}

const SENSITIVE_KEY = /authorization|cookie|password|passw|secret|token|api[-_]?key|dsn|email|phone|body|query|fragment|search|^q$/i;
const URL_KEY = /^(url|http\.url|from|to|to_url|from_url)$/i;
// Sentry's own random identifiers would otherwise look like tokens.
const SENTRY_ID_KEY = /^(trace_id|span_id|parent_span_id|event_id|replay_id|profile_id)$/;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENTRY_ID_KEY.test(key)) out[key] = item;
    else if (SENSITIVE_KEY.test(key)) out[key] = FILTERED;
    else if (URL_KEY.test(key) && typeof item === "string") out[key] = scrubUrl(item);
    else out[key] = scrubValue(item, depth + 1);
  }
  return out;
}

export function scrubData<T>(value: T): T {
  return scrubValue(value, 0) as T;
}

/** Console output can quote anything (API errors, form values), so it is never kept. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: scrubText(breadcrumb.message) } : {}),
    ...(breadcrumb.data ? { data: scrubData(breadcrumb.data) } : {}),
  };
}

export function scrubSpan(span: SpanJSON): SpanJSON {
  return {
    ...span,
    ...(span.description ? { description: scrubText(span.description) } : {}),
    ...(span.data ? { data: scrubData(span.data) } : {}),
  };
}

export function scrubEvent<T extends Event>(event: T): T {
  const out: T = { ...event };
  delete out.user;
  if (out.request) out.request = { method: out.request.method, ...(out.request.url ? { url: scrubUrl(out.request.url) } : {}) };
  if (out.message) out.message = scrubText(out.message);
  if (out.logentry) out.logentry = { ...(out.logentry.message ? { message: scrubText(out.logentry.message) } : {}) };
  if (out.transaction) out.transaction = scrubText(out.transaction);
  if (out.exception?.values) {
    out.exception = { values: out.exception.values.map((value) => ({ ...value, ...(value.value ? { value: scrubText(value.value) } : {}) })) };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter((crumb): crumb is Breadcrumb => crumb !== null);
  if (out.spans) out.spans = out.spans.map(scrubSpan);
  if (out.tags) out.tags = scrubData(out.tags);
  if (out.extra) out.extra = scrubData(out.extra);
  if (out.contexts) {
    // iOS reports the device's own name ("iPhone de Ana"); Android a model.
    const { device, ...contexts } = out.contexts;
    out.contexts = scrubData({ ...contexts, ...(device ? { device: { ...device, name: undefined } } : {}) });
  }
  return out;
}

export const scrubErrorEvent = (event: ErrorEvent): ErrorEvent => scrubEvent(event);
export const scrubTransactionEvent = (event: TransactionEvent): TransactionEvent => scrubEvent(event);
