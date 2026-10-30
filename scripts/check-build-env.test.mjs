import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTION_DECISIONS, validateBuildEnvironment } from "./check-build-env.mjs";

// A complete production configuration with FICTITIOUS decided values (.invalid domains, a temporary
// path): the real API domain, referral landing and Firebase file are not decided yet (Infra, 2026-10-30).
const DECIDED = { apiOrigin: "https://api.afilianet-ficticio.invalid", referralLandingUrl: "https://enlaces.afilianet-ficticio.invalid/join" };
const checkDecided = (env) => validateBuildEnvironment(env, DECIDED);
const production = {
  EAS_BUILD_PROFILE: "production",
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_API_BASE_URL: DECIDED.apiOrigin,
  EXPO_PUBLIC_SURVEYS_PREVIEW: "0",
  EXPO_PUBLIC_SENTRY_ENABLED: "0",
  SENTRY_DISABLE_AUTO_UPLOAD: "true",
  GOOGLE_SERVICES_JSON: "/tmp/google-services.json",
  EXPO_PUBLIC_REFERRAL_LANDING_URL: DECIDED.referralLandingUrl,
};

test("accepts the production origin and explicit staging profiles", () => {
  assert.deepEqual(checkDecided(production), []);
  for (const profile of ["staging", "store-beta", "development-staging"]) {
    assert.deepEqual(validateBuildEnvironment({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx", EXPO_PUBLIC_SURVEYS_PREVIEW: "0", EXPO_PUBLIC_SENTRY_ENABLED: "0" }), []);
  }
});

test("rejects staging, local, example, HTTP and misleading hosts in production", () => {
  for (const url of ["https://staging-api.afilianet.mx", "http://api.afilianet.mx", "http://localhost:8000", "https://api.afilianet.example", "https://api.afilianet.mx.attacker.test", "", "not a URL"]) {
    assert.ok(checkDecided({ ...production, EXPO_PUBLIC_API_BASE_URL: url }).length, url);
  }
});

test("rejects credentials, query parameters and paths", () => {
  for (const url of ["https://user:password@api.afilianet.mx", "https://api.afilianet.mx?token=x", "https://api.afilianet.mx#x", "https://api.afilianet.mx/api"]) {
    assert.ok(checkDecided({ ...production, EXPO_PUBLIC_API_BASE_URL: url }).length);
  }
});

test("rejects missing and mismatched environments", () => {
  assert.ok(validateBuildEnvironment({}).length);
  assert.ok(checkDecided({ ...production, EXPO_PUBLIC_APP_ENV: "staging" }).length);
  assert.ok(checkDecided({ ...production, EAS_BUILD_PROFILE: "store-beta" }).length);
});

test("development-staging rejects a local API or a different environment", () => {
  const env = { EAS_BUILD_PROFILE: "development-staging", EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx" };
  assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_API_BASE_URL: "http://192.168.68.110:8000" }).length);
  assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_API_BASE_URL: "https://api.afilianet.mx" }).length);
  assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_APP_ENV: "development" }).length);
});

test("feature switches only accept 0 or 1, and the store beta decides the surveys preview explicitly", () => {
  const storeBeta = { EAS_BUILD_PROFILE: "store-beta", EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx", EXPO_PUBLIC_SENTRY_ENABLED: "0" };
  assert.ok(validateBuildEnvironment(storeBeta).length);
  assert.deepEqual(validateBuildEnvironment({ ...storeBeta, EXPO_PUBLIC_SURVEYS_PREVIEW: "0" }), []);
  for (const value of ["true", "yes", ""]) {
    assert.ok(validateBuildEnvironment({ ...storeBeta, EXPO_PUBLIC_SURVEYS_PREVIEW: value }).length, value);
    assert.ok(checkDecided({ ...production, EXPO_PUBLIC_PHONE_WHATSAPP: value }).length, value);
    assert.ok(checkDecided({ ...production, EXPO_PUBLIC_SENTRY_ENABLED: value }).length, value);
  }
});

test("store beta: fails with Sentry switched on, a DSN or a PostHog key, whatever their source", () => {
  for (const profile of ["store-beta", "store-beta-apk"]) {
    const env = { EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx", EXPO_PUBLIC_SURVEYS_PREVIEW: "0", EXPO_PUBLIC_SENTRY_ENABLED: "0", EXPO_PUBLIC_SENTRY_DSN: "" };
    assert.deepEqual(validateBuildEnvironment(env), []);
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_ENABLED: undefined }).length);
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_ENABLED: "1" }).length);
    // The DSN that the EAS "preview" environment carries: the profile's blank value must win.
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_DSN: "https://publickey@o0.ingest.us.sentry.io/0" }).length);
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_POSTHOG_API_KEY: "phc_example" }).length);
    assert.deepEqual(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_DSN: "disabled" }), []);
    assert.deepEqual(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_DSN: undefined }), []);
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_SENTRY_DSN: "Disabled" }).length);
  }
  // The publishable production build is held to the same rule: telemetry off.
  assert.ok(checkDecided({ ...production, EXPO_PUBLIC_SENTRY_ENABLED: "1", EXPO_PUBLIC_SENTRY_DSN: "https://publickey@o0.ingest.us.sentry.io/0" }).length);
});

test("eas.json: the store beta ships without sample surveys and without the WhatsApp code channel", async () => {
  const { readFile } = await import("node:fs/promises");
  const eas = JSON.parse(await readFile(new URL("../eas.json", import.meta.url), "utf8"));
  const env = { EAS_BUILD_PROFILE: "store-beta", ...eas.build["store-beta"].env };
  assert.equal(env.EXPO_PUBLIC_SURVEYS_PREVIEW, "0");
  assert.notEqual(env.EXPO_PUBLIC_PHONE_WHATSAPP, "1");
  // The profile value overrides the "preview" environment's DSN (eas-cli merges { ...server, ...profile.env });
  // eas.json rejects "" so the override is the explicit "disabled".
  assert.equal(env.EXPO_PUBLIC_SENTRY_ENABLED, "0");
  assert.equal(env.EXPO_PUBLIC_SENTRY_DSN, "disabled");
  assert.equal(env.EXPO_PUBLIC_POSTHOG_API_KEY, undefined);
  for (const value of Object.values(eas.build["store-beta"].env)) assert.notEqual(value, "", "eas.json rejects empty env values");
  assert.equal(env.SENTRY_DISABLE_AUTO_UPLOAD, "true");
  assert.deepEqual(validateBuildEnvironment(env), []);
});

test("eas.json: store-beta-apk is the same store beta as an installable APK (same environment and switches)", async () => {
  const { readFile } = await import("node:fs/promises");
  const eas = JSON.parse(await readFile(new URL("../eas.json", import.meta.url), "utf8"));
  const apk = eas.build["store-beta-apk"];
  assert.equal(apk.extends, "store-beta");
  assert.equal(apk.env, undefined);
  assert.equal(apk.environment, undefined);
  assert.equal(apk.android.buildType, "apk");
  assert.deepEqual(validateBuildEnvironment({ EAS_BUILD_PROFILE: "store-beta-apk", ...eas.build["store-beta"].env }), []);
  assert.ok(validateBuildEnvironment({ EAS_BUILD_PROFILE: "store-beta-apk", ...eas.build["store-beta"].env, EXPO_PUBLIC_SURVEYS_PREVIEW: undefined }).length);
});

test("privacy-test-apk: only the disposable API, telemetry off and nothing of the beta's services", async () => {
  const { PRIVACY_TEST_ORIGIN } = await import("./check-build-env.mjs");
  const { readFileSync } = await import("node:fs");
  const profile = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8")).build["privacy-test-apk"];
  const env = { EAS_BUILD_PROFILE: "privacy-test-apk", ...profile.env };
  assert.equal(profile.environment, "development");
  assert.equal(env.EXPO_PUBLIC_API_BASE_URL, PRIVACY_TEST_ORIGIN);
  assert.deepEqual(validateBuildEnvironment(env), []);
  for (const url of ["https://staging-api.afilianet.mx", "https://api.afilianet.mx", "http://andres-desk.tail7be8f8.ts.net", "https://andres-desk.tail7be8f8.ts.net.attacker.test", "https://andres-desk.tail7be8f8.ts.net:8443"]) {
    assert.ok(validateBuildEnvironment({ ...env, EXPO_PUBLIC_API_BASE_URL: url }).length, url);
  }
  // Whatever an EAS environment would add: Firebase, Sentry, PostHog.
  assert.ok(validateBuildEnvironment({ ...env, APP_VARIANT: undefined }).length);
  assert.ok(validateBuildEnvironment({ EAS_BUILD_PROFILE: "store-beta-apk", EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx", EXPO_PUBLIC_SURVEYS_PREVIEW: "0", EXPO_PUBLIC_SENTRY_ENABLED: "0", APP_VARIANT: "privacy-test" }).length);
  for (const extra of [{ GOOGLE_SERVICES_JSON: "/tmp/google-services.json" }, { SENTRY_AUTH_TOKEN: "x" }, { EXPO_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, { EXPO_PUBLIC_SENTRY_ENABLED: "1" }, { EXPO_PUBLIC_POSTHOG_API_KEY: "phc_x" }, { SENTRY_DISABLE_AUTO_UPLOAD: undefined }, { EXPO_PUBLIC_SURVEYS_PREVIEW: "1" }, { EXPO_PUBLIC_APP_ENV: "staging" }]) {
    assert.ok(validateBuildEnvironment({ ...env, ...extra }).length, JSON.stringify(extra));
  }
});

test("privacy-test-apk increments only its own versionCode and inherits nothing from the beta's profiles", async () => {
  // EAS keeps the remote versionCode per package (`eas build:version:get`, 2026-10-28: 1 for
  // com.afilianet.mobile.privacytest after build d31ee445, 13 for com.afilianet.mobile, unchanged).
  // Updating the installed test app in place needs a higher versionCode, so this profile increments
  // its own counter; without `extends` it can never touch the beta's.
  const { readFileSync } = await import("node:fs");
  const build = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8")).build;
  assert.equal(build["privacy-test-apk"].autoIncrement, true);
  assert.equal(build["privacy-test-apk"].extends, undefined);
  assert.equal(build["privacy-test-apk"].env.APP_VARIANT, "privacy-test");
});

test("production fails closed while its domains are undecided, even with every value supplied", async () => {
  assert.deepEqual(PRODUCTION_DECISIONS, { apiOrigin: null, referralLandingUrl: null });
  const errors = validateBuildEnvironment(production);
  assert.ok(errors.some((error) => error.includes("dominio de API decidido")));
  assert.ok(errors.some((error) => error.includes("enlaces de referido decidida")));
  // The previously assumed domain is not accepted as decided either.
  assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_API_BASE_URL: "https://api.afilianet.mx" }).length);
});

test("production as committed in eas.json lacks exactly the undecided values: API, Firebase, referral landing", async () => {
  const { readFileSync } = await import("node:fs");
  const profile = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8")).build.production;
  assert.equal(profile.env.EXPO_PUBLIC_API_BASE_URL, undefined);
  const errors = checkDecided({ EAS_BUILD_PROFILE: "production", ...profile.env });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.includes("EXPO_PUBLIC_API_BASE_URL")));
  assert.ok(errors.some((error) => error.includes("GOOGLE_SERVICES_JSON")));
  assert.ok(errors.some((error) => error.includes("EXPO_PUBLIC_REFERRAL_LANDING_URL")));
  // Everything else is already explicit there: telemetry off, no surveys, no WhatsApp.
  assert.deepEqual(checkDecided({
    EAS_BUILD_PROFILE: "production", ...profile.env,
    EXPO_PUBLIC_API_BASE_URL: production.EXPO_PUBLIC_API_BASE_URL,
    GOOGLE_SERVICES_JSON: production.GOOGLE_SERVICES_JSON,
    EXPO_PUBLIC_REFERRAL_LANDING_URL: production.EXPO_PUBLIC_REFERRAL_LANDING_URL,
  }), []);
});

test("production rejects incomplete or contradictory configuration", () => {
  assert.deepEqual(checkDecided(production), []);
  const broken = [
    { EXPO_PUBLIC_SURVEYS_PREVIEW: undefined }, { EXPO_PUBLIC_SURVEYS_PREVIEW: "1" },
    { EXPO_PUBLIC_PHONE_WHATSAPP: "1" },
    { EXPO_PUBLIC_SENTRY_ENABLED: undefined }, { EXPO_PUBLIC_SENTRY_ENABLED: "1" },
    { EXPO_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, { EXPO_PUBLIC_POSTHOG_API_KEY: "phc_x" },
    { SENTRY_DISABLE_AUTO_UPLOAD: undefined }, { SENTRY_AUTH_TOKEN: "x" },
    { GOOGLE_SERVICES_JSON: undefined }, { GOOGLE_SERVICES_JSON: "" },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: undefined },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: "http://enlaces.afilianet-ficticio.invalid/join" },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: "https://staging-admin.afilianet.mx/join" },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: "https://andres-desk.tail7be8f8.ts.net/join" },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: "https://localhost/join" },
    { EXPO_PUBLIC_REFERRAL_LANDING_URL: "https://enlaces.afilianet-ficticio.invalid/join?ref=x" },
    { EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx" },
  ];
  for (const change of broken) assert.ok(checkDecided({ ...production, ...change }).length, JSON.stringify(change));
  // WhatsApp explicitly off is fine.
  assert.deepEqual(checkDecided({ ...production, EXPO_PUBLIC_PHONE_WHATSAPP: "0" }), []);
});
