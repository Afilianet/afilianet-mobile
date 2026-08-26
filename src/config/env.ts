export type AppEnvironment = "development" | "staging" | "production";

function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (value === "staging" || value === "production") {
    return value;
  }
  return "development";
}

function parseTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export const config = {
  appEnv: parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV),
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, ""),
  apiTimeoutMs: parseTimeoutMs(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 15000),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "",
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
};

export type AppConfig = typeof config;

/**
 * Gates development-only QA tooling (currently: the compliance Fake-
 * provider simulator, see DevelopmentStepSimulator). Requires BOTH signals,
 * never just one: `__DEV__` is a React Native/Metro build-time constant
 * that's inlined `false` and dead-code-eliminated out of a release bundle
 * (not merely hidden at runtime), and EXPO_PUBLIC_APP_ENV is this app's own
 * explicit deployment-environment declaration, set per environment file
 * (.env vs .env.staging vs .env.production). Either one alone is a real,
 * independent guard; both together means a release build can never ship
 * this tooling even if one check were ever misconfigured.
 */
export const isDevelopmentSimulatorEnabled = __DEV__ && config.appEnv === "development";
