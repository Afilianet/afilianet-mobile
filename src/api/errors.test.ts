import { ApiError, friendlyMessage, kindForStatus, loginErrorMessage } from "./errors";

describe("kindForStatus", () => {
  it("maps 401/403/404/422/429/5xx to the right kinds", () => {
    expect(kindForStatus(401)).toBe("unauthorized");
    expect(kindForStatus(403)).toBe("forbidden");
    expect(kindForStatus(404)).toBe("not_found");
    expect(kindForStatus(422)).toBe("validation");
    expect(kindForStatus(429)).toBe("rate_limited");
    expect(kindForStatus(500)).toBe("server");
    expect(kindForStatus(503)).toBe("server");
  });

  it("falls back to unknown for anything else", () => {
    expect(kindForStatus(418)).toBe("unknown");
  });
});

describe("friendlyMessage", () => {
  it("gives a generic session-expired message for unauthorized (not the raw backend text)", () => {
    const error = new ApiError("unauthorized", "Unauthenticated.", 401);
    expect(friendlyMessage(error)).toBe("Your session has expired. Please sign in again.");
  });

  it("gives a rate-limit message for 429", () => {
    const error = new ApiError("rate_limited", "Too Many Attempts.", 429);
    expect(friendlyMessage(error)).toMatch(/too many attempts/i);
  });
});

describe("loginErrorMessage", () => {
  it("trusts the backend's message for invalid credentials (401)", () => {
    const error = new ApiError("unauthorized", "These credentials do not match our records.", 401);
    expect(loginErrorMessage(error)).toBe("These credentials do not match our records.");
  });

  it("trusts the backend's message for a restricted account (403)", () => {
    const error = new ApiError("forbidden", "This account has been suspended.", 403);
    expect(loginErrorMessage(error)).toBe("This account has been suspended.");
  });

  it("shows a rate-limit message for 429", () => {
    const error = new ApiError("rate_limited", "Too Many Attempts.", 429);
    expect(loginErrorMessage(error)).toMatch(/too many attempts/i);
  });

  it("shows an offline message without exposing backend details", () => {
    const error = new ApiError("offline", "Unable to reach the server.");
    expect(loginErrorMessage(error)).toMatch(/offline/i);
  });

  it("never surfaces raw backend text for server errors", () => {
    const error = new ApiError("server", "SQLSTATE[HY000] some internal detail", 500);
    const message = loginErrorMessage(error);
    expect(message).not.toContain("SQLSTATE");
  });
});
