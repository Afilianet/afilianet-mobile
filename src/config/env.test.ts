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

  it("accepts internal, staging, and production", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "internal";
    expect(require("./env").config.appEnv).toBe("internal");

    jest.resetModules();
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

  describe("isDevelopmentSimulatorEnabled", () => {
    const ORIGINAL_DEV = (global as { __DEV__?: boolean }).__DEV__;

    afterEach(() => {
      (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV;
    });

    it("is true only when both __DEV__ and EXPO_PUBLIC_APP_ENV=development hold", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      process.env.EXPO_PUBLIC_APP_ENV = "development";
      expect(require("./env").isDevelopmentSimulatorEnabled).toBe(true);
    });

    it("is false in a real build even if EXPO_PUBLIC_APP_ENV is misconfigured as development", () => {
      // __DEV__ false is what an actual release/production JS bundle
      // compiles to -- this must win regardless of the env var, since a
      // misconfigured .env should never be the only thing keeping
      // Fake-provider controls out of a shipped build.
      (global as { __DEV__?: boolean }).__DEV__ = false;
      process.env.EXPO_PUBLIC_APP_ENV = "development";
      expect(require("./env").isDevelopmentSimulatorEnabled).toBe(false);
    });

    it("is false when EXPO_PUBLIC_APP_ENV is production, even under __DEV__", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      process.env.EXPO_PUBLIC_APP_ENV = "production";
      expect(require("./env").isDevelopmentSimulatorEnabled).toBe(false);
    });

    it("is false when EXPO_PUBLIC_APP_ENV is staging", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      process.env.EXPO_PUBLIC_APP_ENV = "staging";
      expect(require("./env").isDevelopmentSimulatorEnabled).toBe(false);
    });

    it("is false when EXPO_PUBLIC_APP_ENV is internal, even under __DEV__ -- Internal Alpha must prefer real backend behavior", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      process.env.EXPO_PUBLIC_APP_ENV = "internal";
      expect(require("./env").isDevelopmentSimulatorEnabled).toBe(false);
    });
  });
});
