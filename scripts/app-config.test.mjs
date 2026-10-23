import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const appConfig = require("../app.config.js");
const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
const storeBetaEnv = eas.build["store-beta"].env;
const AUDIO = ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"];

function resolve(env) {
  const saved = process.env;
  process.env = { ...env };
  try {
    return appConfig({ config: { android: { package: "com.afilianet.mobile" } } });
  } finally {
    process.env = saved;
  }
}

test("store builds drop permissions no enabled feature uses: overlay, storage reads and (without surveys) audio", () => {
  for (const profile of ["store-beta", "store-beta-apk"]) {
    const blocked = resolve({ EAS_BUILD_PROFILE: profile, ...storeBetaEnv }).android.blockedPermissions;
    assert.deepEqual([...blocked].sort(), ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_EXTERNAL_STORAGE", ...AUDIO].sort(), profile);
  }
});

test("store builds keep the camera, its Android 7–9 storage write, location, notifications and vibration", () => {
  const blocked = resolve({ EAS_BUILD_PROFILE: "store-beta", ...storeBetaEnv }).android.blockedPermissions;
  for (const kept of ["CAMERA", "WRITE_EXTERNAL_STORAGE", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS", "VIBRATE", "INTERNET"]) {
    assert.ok(!blocked.includes(`android.permission.${kept}`), kept);
  }
});

test("audio stays whenever surveys may be on, even in a store build", () => {
  for (const preview of ["1", undefined]) {
    const blocked = resolve({ EAS_BUILD_PROFILE: "store-beta", ...storeBetaEnv, EXPO_PUBLIC_SURVEYS_PREVIEW: preview }).android.blockedPermissions;
    for (const permission of AUDIO) assert.ok(!blocked.includes(permission), `${permission} with preview=${preview}`);
  }
});

test("development, staging and local builds keep their manifest unchanged", () => {
  for (const profile of ["development", "development-staging", "staging", "internal", "production", undefined]) {
    assert.equal(resolve({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_SURVEYS_PREVIEW: "0" }).android.blockedPermissions, undefined, String(profile));
  }
});
