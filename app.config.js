// Store builds (EAS sets EAS_BUILD_PROFILE while it resolves this config) drop
// Android permissions that no feature enabled in that build uses. Development
// and staging builds keep their manifest as it was.
const STORE_PROFILES = new Set(["store-beta", "store-beta-apk"]);

function storeBlockedPermissions(env) {
  if (!STORE_PROFILES.has(env.EAS_BUILD_PROFILE)) return [];
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
  return {
    ...config,
    android: {
      ...config.android,
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
      ...(blocked.length ? { blockedPermissions: [...(config.android?.blockedPermissions ?? []), ...blocked] } : {}),
    },
  };
};

module.exports.storeBlockedPermissions = storeBlockedPermissions;
