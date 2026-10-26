import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBuildEnvironment } from "./check-build-env.mjs";

const production = {
  EAS_BUILD_PROFILE: "production",
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_API_BASE_URL: "https://api.afilianet.mx",
};

test("accepts the production origin and explicit staging profiles", () => {
  assert.deepEqual(validateBuildEnvironment(production), []);
  for (const profile of ["staging", "store-beta", "development-staging"]) {
    assert.deepEqual(validateBuildEnvironment({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx", EXPO_PUBLIC_SURVEYS_PREVIEW: "0", EXPO_PUBLIC_SENTRY_ENABLED: "0" }), []);
  }
});

test("rejects staging, local, example, HTTP and misleading hosts in production", () => {
  for (const url of ["https://staging-api.afilianet.mx", "http://api.afilianet.mx", "http://localhost:8000", "https://api.afilianet.example", "https://api.afilianet.mx.attacker.test", "", "not a URL"]) {
    assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_API_BASE_URL: url }).length, url);
  }
});

test("rejects credentials, query parameters and paths", () => {
  for (const url of ["https://user:password@api.afilianet.mx", "https://api.afilianet.mx?token=x", "https://api.afilianet.mx#x", "https://api.afilianet.mx/api"]) {
    assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_API_BASE_URL: url }).length);
  }
});

test("rejects missing and mismatched environments", () => {
  assert.ok(validateBuildEnvironment({}).length);
  assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_APP_ENV: "staging" }).length);
  assert.ok(validateBuildEnvironment({ ...production, EAS_BUILD_PROFILE: "store-beta" }).length);
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
    assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_PHONE_WHATSAPP: value }).length, value);
    assert.ok(validateBuildEnvironment({ ...production, EXPO_PUBLIC_SENTRY_ENABLED: value }).length, value);
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
  }
  // Other profiles keep deciding Sentry through their own switch.
  assert.deepEqual(validateBuildEnvironment({ ...production, EXPO_PUBLIC_SENTRY_ENABLED: "1", EXPO_PUBLIC_SENTRY_DSN: "https://publickey@o0.ingest.us.sentry.io/0" }), []);
});

test("eas.json: the store beta ships without sample surveys and without the WhatsApp code channel", async () => {
  const { readFile } = await import("node:fs/promises");
  const eas = JSON.parse(await readFile(new URL("../eas.json", import.meta.url), "utf8"));
  const env = { EAS_BUILD_PROFILE: "store-beta", ...eas.build["store-beta"].env };
  assert.equal(env.EXPO_PUBLIC_SURVEYS_PREVIEW, "0");
  assert.notEqual(env.EXPO_PUBLIC_PHONE_WHATSAPP, "1");
  // Blank values override the "preview" environment's DSN (eas-cli merges { ...server, ...profile.env }).
  assert.equal(env.EXPO_PUBLIC_SENTRY_ENABLED, "0");
  assert.equal(env.EXPO_PUBLIC_SENTRY_DSN, "");
  assert.equal(env.EXPO_PUBLIC_POSTHOG_API_KEY, "");
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
