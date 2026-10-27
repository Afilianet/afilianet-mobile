# Beta Android autónoma (evaluación para el 29–30 de octubre de 2026)

**Objetivo:** evaluar una **beta cerrada de Android** que funcione sin Metro.
- No es la publicación pública.
- iOS no entra en esta fecha (ver «iOS»).
- Los bloqueos generales del lanzamiento siguen en `FIRST_RELEASE.md`.
- Este documento recoge lo verificado el 2026-10-23 sobre el candidato `release/android-beta` (PR #70), apilado sobre #69 `2236a54`.

## Configuración efectiva por perfil

Se comprobó con `eas.json`, `eas env:list` (entornos de EAS), `eas config` y un `expo export` del bundle de release. No basta con leer el nombre del perfil.

| | `staging` (APK interno) | `store-beta` (AAB) / `store-beta-apk` (APK) | `production` |
|---|---|---|---|
| Entorno EAS | `preview` | `preview` | `production` (**sin variables**) |
| API | `https://staging-api.afilianet.mx` | `https://staging-api.afilianet.mx` | **Sin definir:** el hook previo a la instalación detiene el build |
| `EXPO_PUBLIC_APP_ENV` | `staging` | `staging` | `production` |
| Encuestas | Vista previa con **datos de ejemplo** | **Apagadas** (`EXPO_PUBLIC_SURVEYS_PREVIEW=0`) | Apagadas |
| Código por WhatsApp | No se ofrece (sin `EXPO_PUBLIC_PHONE_WHATSAPP`) | No se ofrece | No se ofrece |
| Sentry | DSN de `preview`; apagado salvo `EXPO_PUBLIC_SENTRY_ENABLED=1` | **Apagado:** `EXPO_PUBLIC_SENTRY_ENABLED=0` y DSN `"disabled"`; el hook detiene el build si llega un DSN real | Sin DSN |
| PostHog | Sin clave: apagado | **Apagado:** sin clave; el hook detiene el build si llega una | Sin clave |
| Push (FCM) | `GOOGLE_SERVICES_JSON` en `preview` | Igual | **Sin archivo:** sin push |
| Liga de referido | `https://staging-admin.afilianet.mx/join/…` | Igual | `afilianetmobile://` (solo con la app instalada) |
| Identificador | `com.afilianet.mobile`; versión remota con autoincremento | Igual | Igual |

**Comprobado en el bundle de release** de store-beta (`expo export`, sin Metro ni `.env`):
- se genera completo (bytecode de Hermes);
- `surveysPreviewEnabled` y `whatsappCodeChannelEnabled` se compilan como la constante `false`;
- contiene la API de staging y ninguna IP local;
- el simulador de verificación está fuera (requiere `__DEV__`);
- `localhost` y `expo-development-client` solo aparecen dentro de librerías (servidor de desarrollo de RN, Spotlight de Sentry, router), no en pantallas a las que llegue el usuario.

## Estado del servidor de staging (2026-10-23)

| Hecho | Fuente | Efecto en la beta |
|---|---|---|
| `GET /api/v1/privacy/notice` responde **HTTP 503** | Comprobado aquí (solo lectura). Causa en la API (`PrivacyNoticeController.php` en `main` `3a2e267`): solo publica con `PRIVACY_NOTICE_PUBLISHED=true`, los 11 textos y datos de `config/privacy.php` completos (responsable, domicilio, correo válido, plazo de eliminación «naturales» o «hábiles») y la retención configurada para cada categoría de evidencia | En la app, «Aviso de privacidad» muestra «El aviso no está disponible por el momento.» |
| `PRIVACY_NOTICE_PUBLISHED=false`, `PRIVACY_RETENTION_SCHEDULE_ENABLED=false` | Sesión de infraestructura (task definition `:51`) | Aviso y retención sin publicar ni activar |
| `AWS_FACE_LIVENESS_ENABLED=true`, `FACE_MATCH_ENGINE_ENABLED=true` | Sesión de infraestructura | La verificación de identidad captura **biometría real** hoy |
| `PUSH_ENABLED=true` | Sesión de infraestructura | Aceptar un referido manda un push real al patrocinador |
| **SMS sin proveedor:** `phone-verification` y `forgot-password {phone}` responden 503 `sms_unavailable` sin crear código ni encolar nada | Sesión de la API (`main` `46adf74`): `SmsServiceProvider.php:49-50`, `PhoneOtpService.php:52` | La app ya muestra «Por ahora no podemos enviar mensajes SMS». No llegan códigos y no hay recuperación por SMS |
| **Correo sin proveedor:** `email-verification` y `forgot-password {email}` responden como si estuviera encolado, pero **no se envía nada** (el trabajo falla) | Sesión de la API: `EmailServiceProvider.php:59-60`. Hueco conocido, PR #84 de la API sin fusionar | La app dice «Te enviamos un enlace…» y el correo nunca llega. Sin proveedor, no hay verificación ni recuperación por correo |
| Alta e inicio de sesión por teléfono y recuperación por SMS: en `main` y en `3a2e267` (commit `b1d4269`). WhatsApp (#79) sin fusionar | Sesión de la API | Las pantallas existen, pero dependen del proveedor de SMS |
| **KYC: no existe ningún mecanismo en el servidor** para impedir capturas en la beta. `AWS_FACE_LIVENESS_ENABLED`/`FACE_MATCH_ENGINE_ENABLED=false` solo quitan la prueba de vida y la comparación; **la subida de documentos sigue abierta** (`Identity/Routes/api.php:76`, `:86`) | Sesión de la API (`ComplianceProviderResolver.php:65`) | Ocultar el botón en la app no protege (sirve un APK anterior o una llamada directa). Se necesita la puerta propuesta por la API, que espera decisión |

## Defectos corregidos en este candidato

1. **El código por WhatsApp se ofrecía aunque el servidor no lo envía.**
   - Staging no tiene API #79: ignora el canal y manda un SMS.
   - La API no expone ningún endpoint para preguntar qué canales hay.
   - **Corrección:** WhatsApp solo aparece si el build lleva `EXPO_PUBLIC_PHONE_WHATSAPP=1`. Por defecto la pantalla ofrece solo SMS, sin selector y sin mencionar WhatsApp en la espera ni en los errores.
2. **Los betatesters de tienda recibían encuestas de ejemplo,** con el botón «Simular cierre de esta encuesta (ejemplo)», y no había forma de apagarlas fuera de producción.
   - **Corrección:** `EXPO_PUBLIC_SURVEYS_PREVIEW=0` las apaga, y `store-beta` lo declara.
   - El hook previo a la instalación exige que `store-beta` lo decida de forma explícita, y solo acepta `0` o `1`.
   - El perfil `staging`, probado físicamente, no cambia.
3. **Nuevo perfil `store-beta-apk`:** el mismo store-beta como APK instalable, para probarlo físicamente sin pasar por la tienda.
4. **Permisos sin uso en los builds de tienda.** Se bloquean desde `app.config.js` solo cuando `EAS_BUILD_PROFILE` es `store-beta` o `store-beta-apk`, con `tools:node="remove"`. Ver «Permisos efectivos».

**Pruebas:**
- conmutador de Encuestas: 3 casos;
- verificación por defecto (solo SMS): 2 casos;
- hook de build: 3 casos, incluido uno que lee el `eas.json` real;
- las pruebas de WhatsApp de #69 siguen corriendo con el canal activado;
- permisos por perfil (`scripts/app-config.test.mjs`): 4 casos;
- mutaciones detectadas en los conmutadores y en los permisos (bloquear también la escritura en almacenamiento, o el audio con encuestas activas).

## Recorridos revisados (código y pruebas existentes)

| Recorrido | Estado | Pruebas |
|---|---|---|
| Registro, inicio de sesión y recuperación por correo o SMS | Sin dependencias de desarrollo. Teléfono y SMS requieren la API #50 en staging (si falta, se muestra «todavía no disponible») | `register`, `login`, `forgot-password`, `sms-availability`, `AuthProvider` |
| Verificación de correo y teléfono | Solo SMS por defecto. «Verificado» solo lo confirma el servidor | `verify-account`, `phone-verification-whatsapp`, `email-verification` |
| Referidos y aceptar con una cuenta existente | API #78 y Admin #52 desplegadas en staging | `referral*`, `join`, `pendingReferral` |
| Cambio de organización | Correcto. Menor: sin protección contra doble toque (no bloquea) | `OrganizationProvider`, `organization-exit`, `rootNavigationGuard` |
| Notificaciones | Push depende de `GOOGLE_SERVICES_JSON` (existe en `preview`) | `PushLifecycle*`, `push/*`, `notifications*` |
| Cámara, documentos y prueba de vida | Simulador excluido del release. Amplify Liveness necesita dispositivo real | `compliance*`, `livenessNativeStrings` |
| Borradores de encuesta | Apagados en la beta de tienda. En `staging` siguen probados (cifrados por cuenta y organización) | `survey-*`, `outbox`, `vault`, `useInterviewRecorder` |

## Privacidad, permisos y SDK

**Eliminación de cuenta:**
- Perfil → opciones de cuenta → «Eliminar mi cuenta» envía `POST /api/v1/account/deletion-request`.
- La app explica que es una **solicitud que se revisa** y que no borra datos del teléfono.
- Pendiente: el proceso del servidor, el plazo de retención y una **URL web pública** para solicitar la eliminación, que Play exige.

**Aviso de privacidad:**
- Se carga desde la API (`/api/v1/privacy/notice`).
- **No hay URL pública,** y la ficha de Play la exige.
- Responsable legal y contacto pendientes (`FIRST_RELEASE.md`).

**Permisos efectivos de Android.** Calculados con `expo config --type introspect` por perfil, más el manifiesto de cada librería autoenlazada; un `remove` gana en la fusión.

| Permiso | store-beta / store-beta-apk | staging / development | Uso y justificación |
|---|---|---|---|
| `CAMERA` | Se conserva | Se conserva | Documento, selfie y prueba de vida (`expo-image-picker`, Amplify) |
| `WRITE_EXTERNAL_STORAGE` (hasta SDK 32) | **Se conserva** | Se conserva | `expo-image-picker` lo exige concedido para la cámara en Android 7–9 (`ImagePickerModule.kt:288-300`). El SDK mínimo es 24 |
| `READ_EXTERNAL_STORAGE` (hasta SDK 32) | **Se quita** | Se conserva | Sin galería; la foto queda en la caché privada mediante `FileProvider` (`ImagePickerUtils.kt:25`) |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | **Se quitan** solo con `EXPO_PUBLIC_SURVEYS_PREVIEW=0` | Se conservan | El grabador de entrevistas es el único uso de audio (`useInterviewRecorder.ts`) |
| `SYSTEM_ALERT_WINDOW` | **Se quita** | Se conserva | Permiso «opcional» de la plantilla de Expo; solo lo usa la capa de desarrollo |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Se conservan | Se conservan | Ubicación opcional en la verificación (precisión `Balanced`). Bloquear FINE queda como mejora posponible, a probar en un dispositivo |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | Se conservan | Se conservan | Notificaciones push |
| `VIBRATE` | Se conserva | Se conserva | Plantilla y notificaciones; no se quita por una regla genérica |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Se conservan | Se conservan | Red, Sentry, imágenes |

**Pendiente de comprobar en el APK construido:** las dependencias de Maven (Amplify Liveness, Firebase Messaging, Sentry nativo) pueden sumar permisos que solo aparecen en la fusión de Gradle. La ronda A incluye verlos en Ajustes → Apps → Afilianet → Permisos. Se pueden revisar con `aapt dump permissions` si se dispone de las herramientas de Android.

`allowBackup=true`: las claves de SecureStore están excluidas del respaldo.

**SDK que recogen datos:**

| SDK | Qué recoge | Configuración |
|---|---|---|
| Sentry | Nada en store-beta (ver «Telemetría») | Apagado en JavaScript y, por tanto, en nativo y rendimiento |
| PostHog | Nada | Apagado por falta de clave. Pendiente: `analytics.reset()` al cerrar sesión, antes de activarlo |
| Expo push / FCM | Token del dispositivo | Se da de baja al cerrar sesión |
| AWS Rekognition Face Liveness | Video del rostro, enviado directo a AWS con credenciales temporales | — |
| URL prefirmada | Fotos de identificación y selfie | — |

**Borrador para «Seguridad de los datos» de Play:**
- nombre, correo y teléfono;
- fotos de identificación y selfie;
- datos biométricos (prueba de vida);
- ubicación aproximada, opcional;
- diagnósticos: **no** en el candidato posterior a 6115fedb (Sentry apagado); **sí** en el APK 6115fedb (ver «Telemetría»);
- identificadores del dispositivo (push).

Sin encuestas, el audio no se recoge en store-beta. Todo viaja cifrado por HTTPS, que exige el hook previo a la instalación.

## Telemetría

**APK 6115fedb (versionCode 12, `71f4fd3`), ya instalado en el Galaxy A06:** Sentry **activo**. Lleva el DSN del entorno `preview` (región US), `environment` `staging` y `tracesSampleRate` 1.0. No tiene consentimiento ni `beforeSend`. Los breadcrumbs de red guardan la URL completa, con tokens de invitación, códigos de referido y la búsqueda `q`. PostHog está apagado (sin clave). Este APK no cambia: solo un build nuevo lo corrige.

**Candidato siguiente (este cambio):**
- `EXPO_PUBLIC_SENTRY_ENABLED=0`, `EXPO_PUBLIC_SENTRY_DSN="disabled"` y `SENTRY_DISABLE_AUTO_UPLOAD=true` en `eas.json` (store-beta, heredado por store-beta-apk). `eas.json` no acepta valores vacíos, así que la app trata `"disabled"` como ausencia de DSN. Sin `EXPO_PUBLIC_POSTHOG_API_KEY`: `preview` no la define.
- eas-cli da prioridad al `env` del perfil sobre el entorno de EAS, así que el DSN de `preview` no se compila.
- `scripts/check-build-env.mjs` corre en el worker (`eas-build-pre-install`) con el entorno ya combinado. Detiene el build si llega un DSN distinto de `"disabled"`, una clave de PostHog o el interruptor distinto de `"0"`.
- Sin `Sentry.init` no arranca nada nativo: el SDK trae `io.sentry.auto-init=false`. Quedan apagados la captura de crashes nativos (NDK), las sesiones y el rendimiento. Las bibliotecas nativas siguen dentro del APK, pero inactivas.

**Si algún día se activa Sentry** (`EXPO_PUBLIC_SENTRY_ENABLED=1` y DSN, en otro perfil):
- `sendDefaultPii` en false y sin usuario.
- `tracesSampleRate` 0.1, sin perfiles, Replay, capturas de pantalla ni jerarquía de vistas.
- `tracePropagationTargets` vacío: no se añaden cabeceras `sentry-trace` ni `baggage` a ninguna petición.
- `src/services/telemetryScrub.ts` limpia eventos, breadcrumbs, transacciones, spans y el contexto de muestreo:
  - rutas normalizadas: `/invitations/:token`, `/staff-invitations/:token`, `/staff-invite/:token`, `/referrals/:code`, `/join/:id/:code`, UUID y números como `:id`;
  - query strings y fragmentos sustituidos por `[Filtered]`;
  - fuera cuerpos, cabeceras, cookies, correos, teléfonos, Bearer y JWT;
  - se descartan los breadcrumbs de consola y el nombre del dispositivo.
- Los crashes nativos los escribe el SDK nativo y no pasan por estos filtros. Solo llevan el scope sincronizado desde JavaScript, que ya está filtrado, más el contexto del dispositivo.
- Los nombres propios en texto libre no se pueden detectar. La app no debe ponerlos en mensajes de error.

## Registros asistidos detenidos por la organización

Una respuesta `assisted_enrollment_unavailable` (API #92) o `kyc_unavailable` (API #86) depende de la configuración de la organización; no es un fallo de red. Por eso:
- el registro guardado deja de reintentarse solo;
- se conserva tal cual (datos, fotos cifradas y ubicación), con el motivo a la vista;
- se ofrecen «Reintentar envío» y «Descartar».

Descartar pide confirmación y dice qué queda en el servidor:
- **No se creó nada:** nunca salió una solicitud, o el servidor rechazó la creación de ese `client_request_id`.
- **Ya existe:** hay `enrollmentId`.
- **No sabemos:** salió una solicitud sin respuesta clara.

Descartar borra solo la copia de este teléfono y nunca registros remotos. No borra fotos que otro pendiente use.

Siguen siendo transitorios y se reintentan: sin conexión, timeout, 5xx sin motivo, otros motivos y cambio de sesión u organización.

El servidor es quien aplica el control: #92 rechaza la creación y `kyc.capture` rechaza la captura. La app solo deja de insistir.

**Retención propuesta (no activada; la decide Andrés junto con la retención general):**
- **Plazo:** 30 días desde que el registro se detuvo. El mismo tope aplicaría a cualquier pendiente nunca enviado, contado desde su captura, porque son datos e INE de un tercero.
- **Advertencias:** en Red, desde el día 7, «Se borrará de este teléfono el {fecha}». Recordatorio al abrir Red en los días 21 y 28. Sin notificaciones push.
- **Al vencer:** se borra solo la copia local. El texto distingue «no se creó nada» de «el registro se conserva en el servidor».
- **Datos ya sincronizados:** la app ya borra sus fotos locales en cuanto el servidor las acepta. Lo que existe en el servidor (registro, evidencias, ubicación) sigue la retención del servidor. La app no lo toca.
- **La persona ya activó su cuenta** (`assisted_access_claimed`, API #92): es permanente. La captura responde 409 con ese motivo y la repetición de la creación devuelve `access_status: "ready"`. El pendiente se detiene igual, pero solo ofrece revisar y descartar, sin «Reintentar envío»: ya existe en el servidor y la persona continúa desde su propia sesión. Un 404 genérico (id ajeno) sigue siendo transitorio.

## Dos hitos

### A. APK técnico para revisión controlada de Andrés

**Qué es:** el build `store-beta-apk` en un solo dispositivo, manejado por Andrés, con cuentas de prueba. No se distribuye a nadie más.

**Requisitos (todos de este lado):**
- este candidato con CI;
- autorizar el costo de **un** build de EAS;
- **otro dispositivo Android** (ver «Instalación»).

**No requiere** publicar el aviso, configurar proveedores ni la puerta de KYC, porque no hay terceros. Reglas de la ronda para no generar datos reales:
- no capturar documentos ni la prueba de vida;
- no enviar códigos;
- no aceptar invitaciones.

### B. Beta distribuida a testers o en tienda

**Sigue bloqueada hasta tener:**
1. **Aviso de privacidad publicado** (hoy 503) con URL pública, y una URL web para solicitar la eliminación de cuenta, ambas exigidas por Play. También el formulario «Seguridad de los datos».
2. **Proveedores reales de SMS y correo en staging,** o decidir de forma explícita que la beta funciona sin ellos.
   - Hoy el correo afirma que se envió y no llega (PR #84 de la API).
   - Hoy el SMS responde 503.
   - Sin proveedores, los testers no pueden verificar ni recuperar su cuenta.
3. **Protección de KYC en el servidor:** la puerta por organización con 503 `kyc_unavailable` (API #86, también en el candidato #88). Falta fusionarla, desplegarla y apagar la captura en la organización de la beta (`compliance.capture_enabled=false`). También se puede autorizar de forma explícita la captura biométrica real con su aviso. **Un botón oculto en la app no sustituye esa protección.** La app ya responde a ese contrato (sección siguiente).
4. **Funciones autorizadas para la beta.** Hoy van apagados WhatsApp OTP, Encuestas (y su audio) y comercio.
5. **Play Console:** la app `com.afilianet.mobile`, un track de prueba interna o cerrada, firma (EAS o Play App Signing) y la configuración de envío (`submit.store-beta`).
6. El hito A aprobado.

**Posponible (no bloquea ninguno de los dos hitos):**
- WhatsApp OTP: espera a Meta y a la API #79; se activa con `EXPO_PUBLIC_PHONE_WHATSAPP=1`.
- Encuestas y su audio en la tienda.
- Ventas y comisiones: siguen con `commerce: false`.
- Ampliaciones electorales (Mobile no tiene ninguna).
- PostHog.
- Bloquear la ubicación FINE.
- Protección contra doble toque al cambiar de organización.
- Guardar el borrador al pasar a segundo plano.
- Variables del entorno `production` y el perfil de producción.
- App Links (`https` → app) para los referidos.

## Respuestas de disponibilidad de la API (#84 y #86)

Seguimiento apilado sobre #70. Contratos leídos en la API #84 `4644f0b` y #86 `825f9e5`, y comprobados sin cambios en el candidato combinado #88 `112cdcc`. Ninguno está fusionado ni desplegado: con la API de staging actual la app se comporta como #70.

| Respuesta del servidor | Qué hace la app |
|---|---|
| 503 `email_unavailable` en recuperación por correo | «Por ahora no podemos enviar correos. No se envió ningún enlace…». Nunca muestra «Revisa tu correo» y conserva el correo escrito. El servidor decide antes de buscar la cuenta, así que la pantalla es idéntica para correos registrados y no registrados |
| 503 `email_unavailable` en verificación de correo (Verificar cuenta y Perfil) | El mismo mensaje. Se retira cualquier «Te enviamos un enlace» anterior y el texto «desde el enlace que te enviamos». No inicia la espera para reenviar |
| `PATCH me/email` | Mobile no tiene pantalla para cambiar el correo. El mapeo vive en `accessErrorMessage` y `friendlyMessage`, y cualquier pantalla futura lo hereda |
| `identity_verification_available: false` en la organización activa | Verificación, Inicio, registro asistido y captura sin conexión explican «Verificación de identidad no disponible en esta organización». No ofrecen comenzar, continuar ni volver a capturar, y ningún paso pendiente monta su componente: no se abre cámara, documento, prueba de vida ni ubicación. La comprobación vive en la tarjeta de cada paso, así que cubre los accesos directos y la actualización manual |
| Campo ausente (API anterior o lista guardada sin conexión) | Desconocido, no `false`: la app actúa como antes y el servidor decide |
| 503 `kyc_unavailable` recibido directamente | Mensaje propio, sin reintento ni apariencia de éxito. La organización a la que se envió la petición (por su encabezado, aunque la respuesta llegue tarde tras cambiar de organización) queda sin captura en esta sesión. La siguiente lista del servidor vuelve a mandar |
| Datos existentes | El caso, el estado de cada paso y los resultados de los pasos aprobados siguen visibles. Las fotos guardadas en el teléfono para un registro asistido se conservan. La sincronización las retiene si el servidor rechaza |

El servidor sigue siendo la protección: la app solo evita ofrecer lo que el servidor rechazará.

## iOS (no entra el 29–30)

**Bloqueos:**
- Membresía de Apple, la app en App Store Connect y credenciales.
- **Un primer build:** el código Swift de Face Liveness nunca se ha compilado, y su dependencia SPM vía CocoaPods está sin probar.
- Clave APNs.
- Manifiesto de privacidad.
- `NSFaceIDUsageDescription`, en inglés y sin uso (lo agrega `expo-secure-store`): quitarlo.
- `NSLocalNetworkUsageDescription`, que agrega `expo-dev-client`: confirmar que no llega al release.
- `usesNonExemptEncryption`.
- `submit.store-beta.ios`.

**En un iPhone físico:**
- prueba de vida completa;
- captura con cámara y permisos denegados;
- push (no se puede probar en el simulador);
- teclado y áreas seguras;
- hoja de compartir;
- eliminación de cuenta;
- arranque en la versión mínima de iOS.

## Plan de build del hito A (no ejecutado; consume cuota de EAS)

En una terminal de PowerShell, desde la raíz de `afilianet-mobile`, con el commit exacto del candidato ya obtenido (`git checkout <SHA>`, sin cambios locales):

```powershell
npx.cmd eas-cli build --platform android --profile store-beta-apk
```

- **Resultado:** un APK firmado con las credenciales remotas del proyecto, `versionCode` 12 (EAS autoincrementa la versión remota, hoy 11).
- **Entorno EAS:** `preview`.
- **API:** `https://staging-api.afilianet.mx`.
- Sin Encuestas ni WhatsApp, y sin los permisos de audio, superposición ni lectura de almacenamiento.

Después de aprobar el hito A, y solo si se autoriza el hito B, se construye el AAB de Play con `--profile store-beta`. El envío a Play no está configurado.

**Comprobaciones locales sin costo antes del build:**
- `npm run test:build-env`;
- `eas config --profile store-beta-apk --platform android`;
- `expo export --platform android` con las variables del perfil.

## Instalación (leer antes de instalar)

El APK y el cliente de desarrollo comparten el identificador `com.afilianet.mobile`. **No pueden convivir como dos apps en el mismo perfil de Android:** para el sistema son la misma app.

**En la tableta de desarrollo**, que tiene el cliente `development-staging` con `versionCode` 11:
- **Misma firma:** probable, porque EAS usa por defecto un solo almacén de claves por app. El APK (versionCode 12) se instala como **actualización** y **reemplaza el cliente de desarrollo.** Se pierde Metro en esa tableta. Volver al cliente sería bajar de versión (12 → 11): Android lo rechaza sin desinstalar.
- **Firma distinta:** la instalación falla (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) y solo procede desinstalando.
- **Desinstalar borra los datos locales de la app:**
  - la sesión;
  - los borradores y respuestas de encuestas cifrados;
  - la cola cifrada de altas asistidas;
  - las claves de SecureStore.

  Lo que no se haya enviado se pierde.
- **Por eso no se instala en la tableta,** ni se desinstala nada en ella.

**Primera opción:** otro dispositivo Android, sin Afilianet instalado (Android 7 o superior; mejor uno con Android 9 o anterior y otro con 13 o superior, si los hay).

**Alternativa solo si no hay otro dispositivo:** un perfil de trabajo o un usuario secundario de Android, si el dispositivo lo permite. Cada perfil o usuario tiene su propia instalación y sus propios datos. Hay que decidirlo antes y comprobarlo en ese dispositivo.

## Ronda física del hito A sobre el paquete autónomo (unos 20 minutos)

**Condiciones:**
- **APK:** `store-beta-apk` del SHA indicado.
- **Dispositivo:** otro Android, nunca la tableta de desarrollo (ver «Instalación»).

**Reglas:** sin Metro, sin aceptar invitaciones y sin envíos a terceros.

| # | Paso | Esperado |
|---|---|---|
| 1 | Abrir la app sin Metro, en modo avión y luego con red | Arranca sin pantalla de desarrollo ni «Error loading app». Sin red: mensaje claro |
| 2 | Iniciar sesión con la cuenta de prueba | Inicio, organización activa y barra inferior **sin pestaña Encuestas** |
| 3 | Perfil → «Verificar mi cuenta» (si el celular está pendiente) | Solo «Enviar código por SMS», sin selector y sin la palabra WhatsApp. **No enviar** |
| 4 | Referidos | Liga `https://staging-admin…`; correo y WhatsApp abren borradores. Cancelar |
| 5 | Cambiar de organización | La liga y los datos cambian a la nueva |
| 6 | Verificación de identidad → documento con cámara | Pide el permiso de cámara; denegarlo muestra cómo habilitarlo. **No capturar ni subir:** staging tiene la biometría real activada |
| 7 | Notificaciones | Pide el permiso; la bandeja carga sin error rojo |
| 8 | Perfil → opciones de cuenta | «Eliminar mi cuenta» visible. **No enviar** la solicitud. El aviso de privacidad: mientras siga sin publicarse, lo esperado es «El aviso no está disponible por el momento.» con «Reintentar», nunca un error rojo distinto |
| 9 | Cerrar sesión y volver a entrar | Sin datos de la sesión anterior |
| 10 | Ajustes de Android → Apps → Afilianet → Permisos | Solo cámara, ubicación y notificaciones. **Sin micrófono** y sin «mostrar sobre otras apps». Anotar si aparece cualquier otro |

**Anotar:** dispositivo, versión de Android, número de build, SHA, captura por paso y el texto exacto de cualquier error.
