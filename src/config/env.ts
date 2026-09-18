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

function parseTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

// Loopback, the Android-emulator host alias, and the RFC1918 private-network
// ranges -- every one of these is only ever reachable from the machine/LAN
// that issued it, never a real staging/production host. `localhost`/
// `127.0.0.1`/`10.0.2.2` are the exact examples that must never leak into a
// staging or production build; the 10.0.0.0/8, 172.16.0.0/12, and
// 192.168.0.0/16 ranges are the same class of mistake (e.g. a developer's
// LAN IP, same shape as `.env.internal.example`'s own documented stopgap).
const LOCAL_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^(\[)?::1(\])?$/,
];

// A plain regex extraction rather than the `URL` global -- this module is
// also `require()`d directly under plain Jest/Node (see env.test.ts), where
// a WHATWG URL polyfill isn't guaranteed to be present, and the app never
// needs anything beyond the bare hostname here.
function extractHostname(url: string): string {
  const match = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/([^/?#]+)/.exec(url.trim());
  const hostAndPort = match ? match[1] : url.trim();
  return hostAndPort.replace(/:\d+$/, "");
}

function isObviouslyLocalUrl(url: string): boolean {
  const hostname = extractHostname(url);
  return LOCAL_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

// Environments backed by a REAL, shared backend that must be reachable from
// outside a single developer's machine/LAN -- deliberately excludes
// "development" (a local Docker backend, an emulator alias, or a tester's
// LAN IP are all legitimate there, see README.md "Changing the API URL")
// and "internal" (Internal Alpha's own documented stopgap, per
// .env.internal.example, is a tester's phone reaching a developer's LAN IP
// directly -- that is still a real, currently-sanctioned workflow, not a
// misconfiguration). Only "staging" and "production" are guarded: an
// obviously local URL there can only ever be a mistake, never intentional.
const ENVIRONMENTS_REQUIRING_A_REAL_HOST: AppEnvironment[] = ["staging", "production"];

function assertRealHostForSharedEnvironments(appEnv: AppEnvironment, apiBaseUrl: string): void {
  if (!ENVIRONMENTS_REQUIRING_A_REAL_HOST.includes(appEnv)) return;
  if (!apiBaseUrl) return; // "not configured yet" is a different problem than "configured wrong."
  if (!isObviouslyLocalUrl(apiBaseUrl)) return;
  throw new Error(
    `EXPO_PUBLIC_API_BASE_URL ("${apiBaseUrl}") looks like a local/emulator/LAN address, which can never be correct ` +
      `for a "${appEnv}" build. Set a real, externally-reachable backend URL for this environment ` +
      "(see README.md \"Environments\").",
  );
}

const appEnv = parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
assertRealHostForSharedEnvironments(appEnv, apiBaseUrl);

export const config = {
  appEnv,
  apiBaseUrl,
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
