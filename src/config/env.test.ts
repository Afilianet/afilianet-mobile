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

  describe("refusing an obviously local API base URL for staging/production", () => {
    it.each(["staging", "production"])("throws for %s with localhost", (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:8000";
      expect(() => require("./env")).toThrow(/localhost/i);
    });

    it.each(["staging", "production"])("throws for %s with 127.0.0.1", (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
      expect(() => require("./env")).toThrow();
    });

    it.each(["staging", "production"])("throws for %s with the Android emulator alias 10.0.2.2", (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://10.0.2.2:8000";
      expect(() => require("./env")).toThrow();
    });

    it.each(["staging", "production"])("throws for %s with a private-LAN IP (192.168.x.x)", (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.1.23:8000";
      expect(() => require("./env")).toThrow();
    });

    it("never throws for development pointed at a local/LAN URL -- that is the normal, sanctioned workflow", () => {
      process.env.EXPO_PUBLIC_APP_ENV = "development";
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
      expect(() => require("./env")).not.toThrow();
    });

    it("never throws for internal pointed at a LAN IP -- Internal Alpha's own documented stopgap workflow", () => {
      process.env.EXPO_PUBLIC_APP_ENV = "internal";
      process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.1.23:8000";
      expect(() => require("./env")).not.toThrow();
    });

    it("never throws when the API base URL is simply unset -- that is a different problem, not a local-URL mistake", () => {
      process.env.EXPO_PUBLIC_APP_ENV = "production";
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
      expect(() => require("./env")).not.toThrow();
    });

    it("accepts a real HTTPS host for staging/production", () => {
      process.env.EXPO_PUBLIC_APP_ENV = "staging";
      process.env.EXPO_PUBLIC_API_BASE_URL = "https://staging-api.afilianet.mx";
      expect(() => require("./env")).not.toThrow();

      jest.resetModules();
      process.env.EXPO_PUBLIC_APP_ENV = "production";
      process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.afilianet.mx";
      expect(() => require("./env")).not.toThrow();
    });
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
