import { config } from "../config/env";
import { markPrivacyReviewRequired } from "../state/privacyReview";
import { ApiError, ApiErrorDetails, kindForStatus } from "./errors";

type TokenGetter = () => string | null;
type OrganizationIdGetter = () => string | null;
/** Receives the token the refused request carried, so a late 401 of an earlier session is recognizable. */
type UnauthorizedHandler = (requestToken: string | null) => void;
type KycUnavailableHandler = (organizationId: string) => void;

let getToken: TokenGetter = () => null;
let getOrganizationId: OrganizationIdGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};
let onKycUnavailable: KycUnavailableHandler = () => {};

/**
 * Wires the API client to the current auth/organization state. Called once
 * from AuthProvider/OrganizationProvider so this module never imports React
 * context directly (keeps it usable from plain functions and tests).
 */
export function configureApiClient(options: {
  getToken?: TokenGetter;
  getOrganizationId?: OrganizationIdGetter;
  onUnauthorized?: UnauthorizedHandler;
  onKycUnavailable?: KycUnavailableHandler;
}) {
  if (options.getToken) getToken = options.getToken;
  if (options.getOrganizationId) getOrganizationId = options.getOrganizationId;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
  if (options.onKycUnavailable) onKycUnavailable = options.onKycUnavailable;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipOrganization?: boolean;
  /** Skip the onUnauthorized side effect (e.g. for the logout call itself, which
   * may legitimately 401 on an already-invalid token and shouldn't retrigger sign-out). */
  skipUnauthorizedHandling?: boolean;
  timeoutMs?: number;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

function extractReason(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "reason" in payload) {
    const reason = (payload as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return undefined;
}

/** Seconds from the JSON body's `retry_after`, else the Retry-After header (seconds form only). */
export function extractRetryAfter(payload: unknown, header: string | null): number | undefined {
  if (payload && typeof payload === "object" && "retry_after" in payload) {
    const value = Number((payload as { retry_after?: unknown }).retry_after);
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value);
  }
  if (header && /^\d+$/.test(header.trim())) return Number(header.trim());
  return undefined;
}

/** Only the privacy refs of a 409 (`pending`, `current`); nothing else of the body is kept. */
function extractPrivacy(payload: unknown): { pending?: unknown; current?: unknown } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { pending, current } = payload as { pending?: unknown; current?: unknown };
  if (pending === undefined && current === undefined) return undefined;
  return { ...(pending !== undefined ? { pending } : {}), ...(current !== undefined ? { current } : {}) };
}

function extractDetails(payload: unknown): ApiErrorDetails | undefined {
  if (payload && typeof payload === "object" && "errors" in payload) {
    const errors = (payload as { errors?: unknown }).errors;
    if (errors && typeof errors === "object") return errors as ApiErrorDetails;
  }
  return undefined;
}

/**
 * Generic typed request. `T` should describe the exact top-level JSON shape
 * returned (e.g. `{ data: User }`) -- this function does not guess at
 * unwrapping conventions, so callers in api/endpoints.ts stay explicit about
 * what the backend actually returns.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new ApiError("unknown", "The API base URL isn't configured. Check your .env file.");
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? config.apiTimeoutMs;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const requestToken = options.skipAuth ? null : getToken();
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;

  if (!options.skipOrganization) {
    const organizationId = getOrganizationId();
    if (organizationId) headers["X-Organization-ID"] = organizationId;
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError("timeout", "The request timed out.");
    }
    throw new ApiError("offline", "Unable to reach the server.");
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const kind = kindForStatus(response.status);
    const error = new ApiError(kind, extractMessage(payload) ?? response.statusText, response.status, extractDetails(payload), {
      reason: extractReason(payload),
      retryAfterSeconds: extractRetryAfter(payload, response.headers?.get?.("Retry-After") ?? null),
      privacy: response.status === 409 ? extractPrivacy(payload) : undefined,
    });
    if (kind === "unauthorized" && !options.skipUnauthorizedHandling) onUnauthorized(requestToken);
    // API #86: capture is off in the organization this request was sent for
    // (its header, not whichever is active by the time a late answer lands).
    const requestOrganizationId = headers["X-Organization-ID"];
    if (error.reason === "kyc_unavailable" && requestOrganizationId) onKycUnavailable(requestOrganizationId);
    // API #93: the server blocks this account until it reviews a notice. Only
    // an answer for the session still signed in may raise the review screen.
    if (error.reason === "privacy_notice_review_required" && requestToken && requestToken === getToken()) {
      markPrivacyReviewRequired(error.privacy?.pending, requestOrganizationId ?? null);
    }
    throw error;
  }

  return payload as T;
}

/** A multi-request sync stops if the user signs out or switches organization. */
export function captureApiSessionGuard(organizationId: string): () => boolean {
  const token = getToken();
  return () => Boolean(token) && getToken() === token && getOrganizationId() === organizationId;
}
