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
      return "You're offline. Check your connection and try again.";
    case "timeout":
      return "That took too long to respond. Please try again.";
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    case "forbidden":
      return "You don't have permission to do that.";
    case "validation":
      return error.message || "Some information isn't valid.";
    case "not_found":
      return "We couldn't find that.";
    case "conflict":
      return error.message || "This can't be completed right now.";
    case "rate_limited":
      return "Too many attempts. Please wait a moment and try again.";
    case "server":
      return "Something went wrong on our end. Please try again shortly.";
    default:
      return error.message || "Something went wrong.";
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
      return error.message || "You can't sign in right now.";
    case "rate_limited":
      return "Too many attempts. Please wait a moment and try again.";
    case "offline":
      return "You're offline. Check your connection and try again.";
    case "timeout":
      return "That took too long. Please try again.";
    case "server":
      return "Something went wrong on our end. Please try again shortly.";
    default:
      return "Something went wrong. Please try again.";
  }
}
