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
