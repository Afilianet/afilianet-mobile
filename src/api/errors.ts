export type ApiErrorKind =
  | "offline"
  | "timeout"
  | "unauthorized" // 401
  | "forbidden" // 403
  | "validation" // 422
  | "not_found" // 404
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
    case "server":
      return "Something went wrong on our end. Please try again shortly.";
    default:
      return error.message || "Something went wrong.";
  }
}
