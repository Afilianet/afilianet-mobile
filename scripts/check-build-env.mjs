import { pathToFileURL } from "node:url";

export function validateBuildEnvironment(env) {
  const errors = [];
  const appEnv = env.EXPO_PUBLIC_APP_ENV;
  const expected = { production: "production", staging: "staging", "store-beta": "staging", internal: "internal", development: "development" };
  if (!["development", "internal", "staging", "production"].includes(appEnv)) {
    errors.push("Define EXPO_PUBLIC_APP_ENV explícitamente.");
  }
  if (expected[env.EAS_BUILD_PROFILE] && expected[env.EAS_BUILD_PROFILE] !== appEnv) {
    errors.push("El entorno no corresponde al perfil de compilación.");
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
    if (["staging", "store-beta"].includes(env.EAS_BUILD_PROFILE) && url.origin !== "https://staging-api.afilianet.mx") {
      errors.push("El perfil de pruebas requiere https://staging-api.afilianet.mx.");
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
