# Beta Android autónoma (evaluación para el 29–30 de octubre de 2026)

**Objetivo:** evaluar una **beta cerrada de Android** que funcione sin Metro.
- No es la publicación pública.
- iOS no entra en esta fecha (ver «iOS»).
- Los bloqueos generales del lanzamiento siguen en `FIRST_RELEASE.md`.
- Este documento recoge lo verificado el 2026-10-23 sobre el candidato `release/android-beta`, apilado sobre #69 `2236a54`.

## Configuración efectiva por perfil

Se comprobó con `eas.json`, `eas env:list` (entornos de EAS), `eas config` y un `expo export` del bundle de release. No basta con leer el nombre del perfil.

| | `staging` (APK interno) | `store-beta` (AAB) / `store-beta-apk` (APK) | `production` |
|---|---|---|---|
| Entorno EAS | `preview` | `preview` | `production` (**sin variables**) |
| API | `https://staging-api.afilianet.mx` | `https://staging-api.afilianet.mx` | **Sin definir:** el hook previo a la instalación detiene el build |
| `EXPO_PUBLIC_APP_ENV` | `staging` | `staging` | `production` |
| Encuestas | Vista previa con **datos de ejemplo** | **Apagadas** (`EXPO_PUBLIC_SURVEYS_PREVIEW=0`) | Apagadas |
| Código por WhatsApp | No se ofrece (sin `EXPO_PUBLIC_PHONE_WHATSAPP`) | No se ofrece | No se ofrece |
| Sentry | DSN de `preview`; `tracesSampleRate` 1.0 | Igual | Sin DSN |
| PostHog | Sin clave: apagado | Sin clave: apagado | Sin clave |
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
| Sin variables `SMS_*` ni `MAIL_*`: se aplican los valores por defecto del código | Sesión de infraestructura (es una inferencia; lo confirma la sesión de la API) | Si el envío falla, no llegan códigos SMS y la recuperación por SMS no funciona |

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

**Pruebas:**
- conmutador de Encuestas: 3 casos;
- verificación por defecto (solo SMS): 2 casos;
- hook de build: 3 casos, incluido uno que lee el `eas.json` real;
- las pruebas de WhatsApp de #69 siguen corriendo con el canal activado;
- mutaciones detectadas en ambos conmutadores.

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

**Permisos efectivos de Android** (`expo config --type introspect` con las variables de store-beta), con lo que conviene decidir para la tienda:
- `CAMERA` (documentos y prueba de vida) y `POST_NOTIFICATIONS`: justificados.
- `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`: la app pide precisión `Balanced`. Se puede bloquear FINE.
- `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`: solo sirven para entrevistas de encuestas, que **están apagadas en store-beta**. Hay que bloquearlos en ese perfil o declararlos.
- `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` y `VIBRATE`: vienen de la plantilla o de librerías. Bloquear tras comprobarlo en un build.
- `allowBackup=true`: las claves de SecureStore están excluidas del respaldo.

Bloquear permisos es un cambio nativo y necesita un build para validarse: queda como decisión antes de subir a Play.

**SDK que recogen datos:**

| SDK | Qué recoge | Configuración |
|---|---|---|
| Sentry | Errores, rendimiento y breadcrumbs | DSN en `preview`; sin `sendDefaultPii` ni `setUser`; sin Replay |
| PostHog | — | Apagado por falta de clave. Pendiente: `analytics.reset()` al cerrar sesión, antes de activarlo |
| Expo push / FCM | Token del dispositivo | Se da de baja al cerrar sesión |
| AWS Rekognition Face Liveness | Video del rostro, enviado directo a AWS con credenciales temporales | — |
| URL prefirmada | Fotos de identificación y selfie | — |

**Borrador para «Seguridad de los datos» de Play:**
- nombre, correo y teléfono;
- fotos de identificación y selfie;
- datos biométricos (prueba de vida);
- ubicación aproximada, opcional;
- diagnósticos (Sentry);
- identificadores del dispositivo (push).

Sin encuestas, el audio no se recoge en store-beta. Todo viaja cifrado por HTTPS, que exige el hook previo a la instalación.

## Bloqueos y lo que se puede posponer

**Bloqueos de la beta cerrada de Android:**
1. Un build `store-beta-apk` instalado y probado en la ronda física de abajo.
2. Acceso a Play Console con la app `com.afilianet.mobile` y un track de prueba interna o cerrada. Firma: decidir si la gestiona EAS o Play App Signing.
3. URL pública del aviso de privacidad y URL web para solicitar la eliminación de cuenta, ambas exigidas por Play. **Hoy el aviso responde 503 en staging,** también dentro de la app. También el formulario «Seguridad de los datos» con lo de arriba.
4. Decisión sobre permisos: bloquear audio en store-beta, o declararlo y justificarlo.
5. Confirmar que staging tiene la API #50 (registro y acceso por teléfono, SMS).

**Posponible (no bloquea una beta cerrada):**
- WhatsApp OTP: espera a Meta y a la API #79; se activa con `EXPO_PUBLIC_PHONE_WHATSAPP=1`.
- Encuestas y su audio en la tienda.
- Ventas y comisiones: siguen con `commerce: false`.
- Ampliaciones electorales.
- PostHog.
- Bloquear la ubicación FINE.
- Protección contra doble toque al cambiar de organización.
- Guardar el borrador al pasar a segundo plano.
- Variables del entorno `production` y el perfil de producción.
- App Links (`https` → app) para los referidos.

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

## Plan de build (no ejecutado; consume cuota de EAS)

Desde la raíz del repositorio, en el commit exacto del candidato:

```powershell
# 1. APK para la ronda física (misma configuración que la tienda)
npx.cmd eas-cli build --platform android --profile store-beta-apk
# 2. Solo después de aprobar la ronda: AAB para la prueba interna/cerrada de Play
npx.cmd eas-cli build --platform android --profile store-beta
# 3. Envío: requiere cuenta de servicio de Play y `submit.store-beta`; hoy no está configurado
```

**Comprobaciones locales sin costo, antes de cada build:**
- `npm run test:build-env`;
- `eas config --profile store-beta-apk --platform android`;
- `expo export --platform android` con las variables del perfil.

## Ronda física única sobre el paquete autónomo (unos 20 minutos)

**Condiciones:**
- **APK:** `store-beta-apk`, instalado limpio en un Android distinto de la tableta de desarrollo, o en la tableta con otra app. Debe convivir con el cliente de desarrollo, porque comparten `com.afilianet.mobile`.
- Si se instala sobre él, **se reemplaza el cliente de desarrollo:** decidirlo antes.

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

**Anotar:** dispositivo, versión de Android, número de build, SHA, captura por paso y el texto exacto de cualquier error.
