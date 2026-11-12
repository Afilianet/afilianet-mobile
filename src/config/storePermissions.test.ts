/* eslint-disable @typescript-eslint/no-require-imports */
const { storeBlockedPermissions } = require("../../app.config.js");
const eas = require("../../eas.json");

const AUDIO = ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"];

/** The env a store build actually gets: its profile's env, following `extends`. */
function profileEnv(name: string): Record<string, string> {
  const profile = eas.build[name];
  const parent = profile.extends ? profileEnv(profile.extends) : {};
  return { ...parent, ...(profile.env ?? {}), EAS_BUILD_PROFILE: name };
}

describe("store build permissions", () => {
  it("store-beta keeps the microphone blocked (no surveys)", () => {
    const blocked = storeBlockedPermissions(profileEnv("store-beta"));
    expect(blocked).toEqual(expect.arrayContaining(AUDIO));
  });

  it("store-beta-surveys allows only the microphone, keeping the other store blocks", () => {
    const env = profileEnv("store-beta-surveys");
    expect(env).toMatchObject({
      EXPO_PUBLIC_SURVEYS_PREVIEW: "1",
      EXPO_PUBLIC_SURVEYS_SOURCE: "api",
      EXPO_PUBLIC_PHONE_WHATSAPP: "0",
      EXPO_PUBLIC_SENTRY_ENABLED: "0",
      EXPO_PUBLIC_APP_ENV: "staging",
      EXPO_PUBLIC_API_BASE_URL: "https://staging-api.afilianet.mx",
    });
    expect(eas.build["store-beta-surveys"].extends).toBe("store-beta");
    const blocked = storeBlockedPermissions(env);
    for (const permission of AUDIO) expect(blocked).not.toContain(permission);
    expect(blocked).toEqual(expect.arrayContaining(["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_EXTERNAL_STORAGE"]));
  });
});
