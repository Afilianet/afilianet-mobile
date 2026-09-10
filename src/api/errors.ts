import { strings } from "../i18n";

export type ApiErrorKind =
  | "offline"
  | "timeout"
  | "unauthorized" // 401
  | "forbidden" // 403
  | "validation" // 422
  | "not_found" // 404
  | "conflict" // 409
  | "rate_limited" // 429
  | "server" // 5xx
  | "unknown";

export interface ApiErrorDetails {
  [field: string]: string[] | string | undefined;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly details?: ApiErrorDetails;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

export function friendlyMessage(error: ApiError): string {
  switch (error.kind) {
    case "offline":
      return strings.shared.apiErrors.offline;
    case "timeout":
      return strings.shared.apiErrors.timeout;
    case "unauthorized":
      return strings.shared.apiErrors.sessionExpired;
    case "forbidden":
      return strings.shared.apiErrors.noPermission;
    case "validation":
      return error.message || strings.shared.apiErrors.notValid;
    case "not_found":
      return strings.shared.apiErrors.notFound;
    case "conflict":
      return error.message || strings.shared.apiErrors.conflict;
    case "rate_limited":
      return strings.shared.apiErrors.rateLimited;
    case "server":
      return strings.shared.apiErrors.server;
    default:
      return error.message || strings.shared.errorState.fallbackMessage;
  }
}

/**
 * Error copy specifically for the login screen. Unlike friendlyMessage(),
 * which is used for general in-app errors (e.g. a session expiring mid-use),
 * this trusts the backend's message for 401/403 on a login attempt -- those
 * are deliberately crafted, safe-to-display strings ("These credentials do
 * not match our records.", "This account has been suspended.") that don't
 * reveal whether an email has an account or expose implementation details.
 */
export function loginErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case "unauthorized":
    case "forbidden":
      return error.message || strings.shared.apiErrors.loginFailed;
    case "rate_limited":
      return strings.shared.apiErrors.rateLimited;
    case "offline":
      return strings.shared.apiErrors.offline;
    case "timeout":
      return strings.shared.apiErrors.loginTimeout;
    case "server":
      return strings.shared.apiErrors.server;
    default:
      return strings.compliance.genericError;
  }
}
