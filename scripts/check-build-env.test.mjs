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
  for (const profile of ["staging", "store-beta"]) {
    assert.deepEqual(validateBuildEnvironment({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx" }), []);
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
