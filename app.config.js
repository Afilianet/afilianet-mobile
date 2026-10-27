// Store builds (EAS sets EAS_BUILD_PROFILE while it resolves this config) drop
// Android permissions that no feature enabled in that build uses. Development
// and staging builds keep their manifest as it was.
const STORE_PROFILES = new Set(["store-beta", "store-beta-apk", "privacy-test-apk"]);

// The physical privacy test (Mobile #75) runs against a disposable API, never
// staging. It is selected by APP_VARIANT from the profile's env, NOT by
// EAS_BUILD_PROFILE: eas-cli resolves this config locally (package for
// credentials and the remote versionCode) without EAS_BUILD_PROFILE, and both
// sides must see the same app. Its APK is a separate app: its own package (own sandbox: token,
// SecureStore, AsyncStorage and files are not shared with the installed beta)
// and its own scheme (it never opens the beta's links). No Firebase file: the
// EAS project's file is registered for com.afilianet.mobile only.
const PRIVACY_TEST_VARIANT = "privacy-test";
const PRIVACY_TEST_IDENTITY = {
  name: "Afilianet PRUEBA avisos",
  scheme: "afilianetprivacytest",
  package: "com.afilianet.mobile.privacytest",
};

function storeBlockedPermissions(env) {
  if (!STORE_PROFILES.has(env.EAS_BUILD_PROFILE) && env.APP_VARIANT !== PRIVACY_TEST_VARIANT) return [];
  const blocked = [
    // Expo template "optional" permission: only the development overlay uses it.
    "android.permission.SYSTEM_ALERT_WINDOW",
    // No gallery access; camera photos stay in the app's own cache (FileProvider).
    // WRITE_EXTERNAL_STORAGE stays: expo-image-picker requires it for the camera on Android 7–9.
    "android.permission.READ_EXTERNAL_STORAGE",
  ];
  if (env.EXPO_PUBLIC_SURVEYS_PREVIEW === "0") {
    // The survey interview recorder is the only feature that records or routes audio.
    blocked.push("android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS");
  }
  return blocked;
}

module.exports = ({ config }) => {
  const blocked = storeBlockedPermissions(process.env);
  const privacyTest = process.env.APP_VARIANT === PRIVACY_TEST_VARIANT;
  return {
    ...config,
    ...(privacyTest ? { name: PRIVACY_TEST_IDENTITY.name, scheme: PRIVACY_TEST_IDENTITY.scheme } : {}),
    android: {
      ...config.android,
      ...(privacyTest ? { package: PRIVACY_TEST_IDENTITY.package } : {}),
      ...(process.env.GOOGLE_SERVICES_JSON && !privacyTest ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
      ...(blocked.length ? { blockedPermissions: [...(config.android?.blockedPermissions ?? []), ...blocked] } : {}),
    },
  };
};

module.exports.storeBlockedPermissions = storeBlockedPermissions;
module.exports.PRIVACY_TEST_IDENTITY = PRIVACY_TEST_IDENTITY;
