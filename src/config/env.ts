// "internal" (Phase: Internal Alpha) is a real-backend, real-provider build
// for handing to a non-programmer product owner on a physical device -- it
// is NOT a fifth thing conceptually, it behaves exactly like "production"
// everywhere that matters (isDevelopmentSimulatorEnabled below, Sentry
// sample rate) except its own API base URL/Sentry environment tag, so an
// Alpha crash is never confused with a real production one. See
// README.md "Environments" for what each value is for.
export type AppEnvironment = "development" | "internal" | "staging" | "production";

function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (value === "internal" || value === "staging" || value === "production") {
    return value;
  }
  return "development";
}

// eas.json rejects empty env values, so a store profile overrides the DSN its
// EAS environment carries with this explicit placeholder instead of "".
const DISABLED = "disabled";

function configuredValue(value: string | undefined): string {
  return value === undefined || value === DISABLED ? "" : value;
}

function parseTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export const config = {
  appEnv: parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV),
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, ""),
  apiTimeoutMs: parseTimeoutMs(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 15000),
  // Sentry needs an explicit "1" as well as a DSN: a DSN sitting in an EAS
  // environment must never switch error reporting on by itself. Store builds
  // ship "0" and DSN "disabled" (scripts/check-build-env.mjs enforces both).
  sentryEnabled: process.env.EXPO_PUBLIC_SENTRY_ENABLED === "1",
  sentryDsn: configuredValue(process.env.EXPO_PUBLIC_SENTRY_DSN),
  posthogApiKey: configuredValue(process.env.EXPO_PUBLIC_POSTHOG_API_KEY),
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
