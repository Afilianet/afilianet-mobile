/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules() + require() is the standard way to re-evaluate a module with different process.env values between tests. */
describe("config/env", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to development when EXPO_PUBLIC_APP_ENV is unset", () => {
    delete process.env.EXPO_PUBLIC_APP_ENV;
    expect(require("./env").config.appEnv).toBe("development");
  });

  it("accepts staging and production", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "staging";
    expect(require("./env").config.appEnv).toBe("staging");
  });

  it("falls back to development for an unrecognized value", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "nonsense";
    expect(require("./env").config.appEnv).toBe("development");
  });

  it("strips trailing slashes from the API base URL", () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://example.test/";
    expect(require("./env").config.apiBaseUrl).toBe("http://example.test");
  });

  it("falls back to a default timeout when unset or invalid", () => {
    delete process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
    expect(require("./env").config.apiTimeoutMs).toBe(15000);

    jest.resetModules();
    process.env.EXPO_PUBLIC_API_TIMEOUT_MS = "not-a-number";
    expect(require("./env").config.apiTimeoutMs).toBe(15000);
  });

  it("leaves Sentry/PostHog blank so services can no-op", () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    const { config } = require("./env");
    expect(config.sentryDsn).toBe("");
    expect(config.posthogApiKey).toBe("");
  });
});
