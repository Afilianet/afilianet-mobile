import { apiRequest, configureApiClient } from "./client";
import { ApiError } from "./errors";

jest.mock("../config/env", () => ({
  config: {
    appEnv: "development",
    apiBaseUrl: "http://api.test",
    apiTimeoutMs: 5000,
    sentryDsn: "",
    posthogApiKey: "",
    posthogHost: "",
  },
}));

describe("apiRequest", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    configureApiClient({ getToken: () => null, getOrganizationId: () => null, onUnauthorized: () => {} });
  });

  it("attaches Authorization and X-Organization-ID headers when configured", async () => {
    configureApiClient({ getToken: () => "tok123", getOrganizationId: () => "org-uuid" });
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiRequest("/api/v1/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok123");
    expect(headers["X-Organization-ID"]).toBe("org-uuid");
  });

  it("throws a typed ApiError with the right kind for a 422", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid", errors: { email: ["Required"] } }), { status: 422 }),
      ) as unknown as typeof fetch;

    await expect(apiRequest("/api/v1/x")).rejects.toMatchObject({
      kind: "validation",
      status: 422,
      details: { email: ["Required"] },
    });
  });

  it("calls onUnauthorized and throws on a 401", async () => {
    const onUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized });
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 })) as unknown as typeof fetch;

    await expect(apiRequest("/api/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("maps an aborted request to a timeout error", async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as unknown as typeof fetch;

    await expect(apiRequest("/api/v1/slow", { timeoutMs: 5 })).rejects.toMatchObject({ kind: "timeout" });
  });
});
