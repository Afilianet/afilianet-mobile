import { pathToFileURL } from "node:url";

// The disposable API of the physical privacy test (Tailscale, tailnet only). Never staging.
export const PRIVACY_TEST_ORIGIN = "https://andres-desk.tail7be8f8.ts.net";

export function validateBuildEnvironment(env) {
  const errors = [];
  const appEnv = env.EXPO_PUBLIC_APP_ENV;
  const expected = { production: "production", staging: "staging", "development-staging": "staging", "store-beta": "staging", "store-beta-apk": "staging", "privacy-test-apk": "internal", internal: "internal", development: "development" };
  if (!["development", "internal", "staging", "production"].includes(appEnv)) {
    errors.push("Define EXPO_PUBLIC_APP_ENV explícitamente.");
  }
  if (expected[env.EAS_BUILD_PROFILE] && expected[env.EAS_BUILD_PROFILE] !== appEnv) {
    errors.push("El entorno no corresponde al perfil de compilación.");
  }
  // Feature switches are read as exactly "1"/"0": anything else ("true", "yes") would be silently ignored.
  for (const name of ["EXPO_PUBLIC_SURVEYS_PREVIEW", "EXPO_PUBLIC_PHONE_WHATSAPP", "EXPO_PUBLIC_SENTRY_ENABLED"]) {
    if (env[name] !== undefined && !["0", "1"].includes(env[name])) {
      errors.push(`${name} solo admite "0" o "1".`);
    }
  }
  // A store build reaches outside testers: whether they see the surveys preview must be an explicit decision.
  if (["store-beta", "store-beta-apk"].includes(env.EAS_BUILD_PROFILE) && env.EXPO_PUBLIC_SURVEYS_PREVIEW === undefined) {
    errors.push("store-beta debe decidir EXPO_PUBLIC_SURVEYS_PREVIEW (\"0\" o \"1\") explícitamente.");
  }
  // The store beta's privacy notice describes no diagnostics or analytics. This runs on the
  // EAS worker with the merged environment, so a DSN or key inherited from an EAS environment fails the build.
  if (["store-beta", "store-beta-apk", "privacy-test-apk"].includes(env.EAS_BUILD_PROFILE)) {
    if (env.EXPO_PUBLIC_SENTRY_ENABLED !== "0") errors.push("store-beta requiere EXPO_PUBLIC_SENTRY_ENABLED=\"0\".");
    // eas.json rejects empty values: "disabled" is the only accepted override of the environment's DSN.
    if (![undefined, "", "disabled"].includes(env.EXPO_PUBLIC_SENTRY_DSN)) errors.push("store-beta requiere EXPO_PUBLIC_SENTRY_DSN ausente o \"disabled\".");
    if (![undefined, "", "disabled"].includes(env.EXPO_PUBLIC_POSTHOG_API_KEY)) errors.push("store-beta no debe incluir EXPO_PUBLIC_POSTHOG_API_KEY.");
  }
  // A separate app against a disposable API: nothing of the beta's services may come along,
  // whichever EAS environment would supply it.
  // The variant (not the profile name) selects the separate package in app.config.js.
  if ((env.EAS_BUILD_PROFILE === "privacy-test-apk") !== (env.APP_VARIANT === "privacy-test")) {
    errors.push("APP_VARIANT=\"privacy-test\" solo y siempre con el perfil privacy-test-apk.");
  }
  if (env.EAS_BUILD_PROFILE === "privacy-test-apk") {
    if (env.EXPO_PUBLIC_SURVEYS_PREVIEW !== "0") errors.push("privacy-test-apk requiere EXPO_PUBLIC_SURVEYS_PREVIEW=\"0\".");
    if (env.GOOGLE_SERVICES_JSON) errors.push("privacy-test-apk no debe recibir GOOGLE_SERVICES_JSON (Firebase).");
    if (env.SENTRY_AUTH_TOKEN) errors.push("privacy-test-apk no debe recibir SENTRY_AUTH_TOKEN.");
    if (env.SENTRY_DISABLE_AUTO_UPLOAD !== "true") errors.push("privacy-test-apk requiere SENTRY_DISABLE_AUTO_UPLOAD=\"true\".");
  }
  let url;
  try {
    url = new URL(env.EXPO_PUBLIC_API_BASE_URL);
  } catch {
    errors.push("Define EXPO_PUBLIC_API_BASE_URL con una URL válida.");
  }
  if (url) {
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
      errors.push("La URL de la API debe ser un origen sin credenciales, ruta ni parámetros.");
    }
    if (appEnv !== "development" && url.protocol !== "https:") {
      errors.push("Las compilaciones de prueba y producción requieren HTTPS.");
    }
    if (appEnv === "production" && url.origin !== "https://api.afilianet.mx") {
      errors.push("Producción requiere https://api.afilianet.mx; no uses staging, direcciones locales ni ejemplos.");
    }
    if (["staging", "store-beta", "store-beta-apk", "development-staging"].includes(env.EAS_BUILD_PROFILE) && url.origin !== "https://staging-api.afilianet.mx") {
      errors.push("El perfil de pruebas requiere https://staging-api.afilianet.mx.");
    }
    if (env.EAS_BUILD_PROFILE === "privacy-test-apk" && url.origin !== PRIVACY_TEST_ORIGIN) {
      errors.push(`privacy-test-apk requiere ${PRIVACY_TEST_ORIGIN}; nunca staging ni producción.`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateBuildEnvironment(process.env);
  if (errors.length) {
    for (const message of errors) console.error(message);
    process.exitCode = 1;
  } else {
    console.log("Configuración de compilación válida. No acredita publicación ni disponibilidad del servidor.");
  }
}
