# Perfil publicable `production` (MVP)

**Estado:** preparado el 2026-10-30 en la rama `release/mvp-mobile`. **No se ha construido.**

**Diseño:** el perfil **falla cerrado**. `scripts/check-build-env.mjs` rechaza el build mientras falte cualquier valor no decidido. Ningún valor se inventa ni se supone.

**Fuentes:** los hechos de infraestructura vienen de Infra (`main` `7142cc4` y lecturas de staging del 2026-10-30).

## Qué fija el perfil (`eas.json` → `build.production`)

| Aspecto | Valor | Notas |
|---|---|---|
| Entorno | `EXPO_PUBLIC_APP_ENV=production`, entorno EAS `production`, `EXPO_NO_DOTENV=1` | |
| Formato | `app-bundle` (AAB) | Sin cambios |
| Paquete | `com.afilianet.mobile`, versión 1.0.0 | Sin cambios de identidad |
| Firma | Credenciales remotas de EAS para `com.afilianet.mobile` | **Sin cambios.** Son las de vc12 y vc13 |
| versionCode | `autoIncrement` remoto, como antes | **No se reservó ni se incrementó.** El contador sigue en 13 |
| Telemetría | `EXPO_PUBLIC_SENTRY_ENABLED=0`, DSN `disabled`, `SENTRY_DISABLE_AUTO_UPLOAD=true`, sin PostHog | La comprobación también rechaza `SENTRY_AUTH_TOKEN` |
| Encuestas | `EXPO_PUBLIC_SURVEYS_PREVIEW=0` | Fuera del MVP |
| Teléfono | **SMS**. `EXPO_PUBLIC_PHONE_WHATSAPP=0` | WhatsApp espera a API #79. La comprobación rechaza `1` |
| Permisos | `production` está en `STORE_PROFILES` (`app.config.js`) | Quita `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`, igual que la beta |

## Lo que falta y bloquea el build

La comprobación lo rechaza **hoy** con estos tres motivos (prueba: `production as committed in eas.json lacks exactly the undecided values`).

### 1. API de producción: NO DECIDIDA
- **Situación:** no existe API de producción (ni ALB, ni ECS, ni base de datos). El Terraform de producción no tiene certificado ni dominio, y el DNS es externo (GoDaddy).
- **En el código:** `PRODUCTION_DECISIONS.apiOrigin = null`. El dominio que antes estaba fijo (`api.afilianet.mx`) **ya no se acepta** como decidido.
- **Criterio de cierre:**
  - Andrés decide el dominio;
  - Infra emite el certificado y `https://<dominio>/up` responde 200;
  - se fijan `apiOrigin` y `EXPO_PUBLIC_API_BASE_URL`.

### 2. Página HTTPS de los enlaces de referido: NO DECIDIDA
- **Situación:** en staging la sirve Admin en `https://staging-admin.afilianet.mx/join/{org}/{code}`. En producción no hay Admin.
- **App Links:** no está definido quién servirá `assetlinks.json` (Android) ni `apple-app-site-association` para enlaces verificados.
- **En el código:**
  - la app ya admite `EXPO_PUBLIC_REFERRAL_LANDING_URL` (`src/utils/referral.ts`). Sin ella, en producción el enlace sigue siendo `afilianetmobile://join/…`, que no se puede tocar en WhatsApp;
  - `PRODUCTION_DECISIONS.referralLandingUrl = null`.
- **Criterio de cierre:** dominio de Admin de producción decidido y sirviendo `/join`; después se fijan el valor y la variable.

### 3. Firebase para push: NO DECIDIDO
- **Situación:**
  - la app usa tokens de Expo y Android exige la configuración de Firebase de `com.afilianet.mobile`;
  - Infra no tiene configuración de Firebase ni de FCM;
  - la API envía con Expo (`PUSH_ENABLED`, `EXPO_ACCESS_TOKEN`). En el borrador de producción `PUSH_ENABLED` es `false` por defecto.
- **Pendiente de decidir:**
  - el proyecto de Firebase: compartido con `preview` o separado;
  - quién carga `GOOGLE_SERVICES_JSON` en el entorno EAS `production`;
  - quién sube las credenciales FCM a Expo.
- **Criterio de cierre:**
  - la variable presente en EAS;
  - credenciales FCM en Expo;
  - `PUSH_ENABLED` y `EXPO_ACCESS_TOKEN` en la API de producción;
  - prueba física de registro y desregistro.

## Requisitos fuera del perfil (no los resuelve Mobile)
- **SMS (obligatorio en el MVP), bloqueado:**
  - la cuenta está en sandbox, compartida entre staging y producción, con límite de USD 1;
  - sin protección solo para México y sin alarmas.
  - Es el bloqueante **B9** del paquete coordinado por API.
- **Correo:** no hay identidad de SES en producción. En staging la lista permitida está vacía.
- **Aviso de privacidad:**
  - contacto `servicioalcliente@afilianet.mx`, que sale de la configuración de la API;
  - la API responde 503 hasta que se publique con textos y días de retención.
- **Solicitudes de eliminación:** `PRIVACY_DELETION_REQUESTS_ENABLED` sin definir; la API responde 503.
- **Sesiones:** `SANCTUM_EXPIRATION` sin definir, así que aplica el valor por defecto de 30 días.
- **Play Console:**
  - no existe la app;
  - no hay decisión sobre Play App Signing ni la clave de subida;
  - `submit.production` está vacío.
  - Requiere a Andrés.
- **Paso KYC `terms_acceptance`:** bloqueante **B1**; el responsable es API.

## Cómo se desbloquea, sin inventar
1. Andrés decide los dominios; Infra confirma el certificado y HTTPS.
2. Se fijan los valores en `PRODUCTION_DECISIONS` y en `eas.json` o el entorno EAS (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_REFERRAL_LANDING_URL`), con un commit propio y CI.
3. Firebase y Expo configurados por quien Andrés designe. **Ningún cambio en EAS sin su autorización.**
4. `eas config -e production` y la comprobación sin errores. Solo entonces se solicita **un** build.
