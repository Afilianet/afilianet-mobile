import { config } from "../config/env";
import { ApiError, ApiErrorDetails, kindForStatus } from "./errors";

type TokenGetter = () => string | null;
type OrganizationIdGetter = () => string | null;
type UnauthorizedHandler = () => void;

let getToken: TokenGetter = () => null;
let getOrganizationId: OrganizationIdGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/**
 * Wires the API client to the current auth/organization state. Called once
 * from AuthProvider/OrganizationProvider so this module never imports React
 * context directly (keeps it usable from plain functions and tests).
 */
export function configureApiClient(options: {
  getToken?: TokenGetter;
  getOrganizationId?: OrganizationIdGetter;
  onUnauthorized?: UnauthorizedHandler;
}) {
  if (options.getToken) getToken = options.getToken;
  if (options.getOrganizationId) getOrganizationId = options.getOrganizationId;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipOrganization?: boolean;
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

  if (!options.skipAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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
    const error = new ApiError(kind, extractMessage(payload) ?? response.statusText, response.status, extractDetails(payload));
    if (kind === "unauthorized") onUnauthorized();
    throw error;
  }

  return payload as T;
}
