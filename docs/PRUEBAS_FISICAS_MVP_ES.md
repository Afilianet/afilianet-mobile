# Guion de pruebas físicas del MVP (Mobile integrado)

**Rama:** `integration/mvp-physical-tests`. Contiene, en este orden:
- #47 (`dba4076`);
- Mobile #43 (`51c70b1`), integrado en #49;
- #49 (`f48b98f`);
- #50 (`c5e6cbc`);
- tres correcciones de integración (ver al final).

No se mezcla nada en `main`.

**Regla de evidencia:** un paso cuenta como probado en teléfono solo si se ejecutó en un teléfono contra staging. Lo que solo cubren las pruebas automatizadas está en la última sección y no se marca como probado.

## 1. Requisitos

### API: dependencias y contrato contrastado

Los números de PR de esta tabla son de **afilianet-api**, no de Mobile. SHA del 2026-10-14.

| Necesario para | PR de API | SHA actual | Contrato contrastado por Mobile |
|---|---|---|---|
| Login con `identifier` y celular, registro directo, código SMS, recuperación por celular | API #50 `feat/unified-account-access` (base: API #45) | `598219b2d4e02c090fb0037ac26fa6cef84911ef` | `03c6b8b`. Hasta `598219b` solo cambió una línea de `docs/auth/ACCOUNT_ACCESS_CONTRACT.md` (`errors.code` del OTP) |
| Notificaciones de plataforma (cuentas sin organización) | API #45 `feat/platform-users-notifications` | `53b1086e697ddfd61040bde76ca02db06fdf0d6c` | El de Mobile #43, integrado en #49 |
| Encuestas | API #51 `feat/survey-module` | `4741dbb820771adcf1eae251ecbe3e1e21f459eb` | `docs/surveys/SURVEY_CONTRACT.md` en `93161a3` (API #52, que incluye #51). Respecto de `aa94798`, que es la versión con la que Mobile se conectó, solo se agregaron endpoints de staff, retención y procesamiento; nada de lo que Mobile llama cambió |
| Borrado real de audio (retención de 1 año) | API #52 `feat/survey-audio-hard-delete` (base: API #51) | `93161a38720e12068bf82f30bb0cd322c06dee1a` | No afecta a Mobile |
| Push que abre una encuesta | Sin PR: rama `fix/notifications-search-concurrency` (también en `feat/notification-campaign-history`) | `e1ce99a948501e5ac9b87f13fb9e40c8af6885a0` | Payload `{screen, organization_id, survey_id, version_id}` |
| Recaptura de prueba de vida | `POST /compliance/cases/{case}/retry-liveness` | — | Sin verificar en esta entrega |
| Código SMS | `SMS_PROVIDER_ENABLED=true` y credenciales de AWS SNS | — | Según la documentación de API #50, apagado y sin credenciales |

### API en staging: lo observado, no lo confirmado

El 2026-10-13 se hicieron peticiones sin credenciales a `https://staging-api.afilianet.mx/api/v1`. **Esto no confirma qué está desplegado.** Un 404 sin credenciales puede deberse a que la ruta no existe, a otro método o prefijo, o a un middleware que oculta la ruta. El despliegue se confirma con Infraestructura o API (SHA desplegado), o con una petición autenticada antes de cada bloque de pasos.

| Ruta | Respuesta observada | Despliegue |
|---|---|---|
| `GET /auth/register`, `/auth/phone-verification`, `/auth/verify-phone` | 404 | Sin confirmar |
| `POST /auth/login` con cuerpo vacío | 422 que exige `email` y `password` (no menciona `identifier`) | Sugiere el contrato anterior; sin confirmar |
| `GET /platform/notifications` | 404 | Sin confirmar |
| `GET /surveys/available`, `/surveys/audio-config` | 404 | Sin confirmar |
| `GET /me`, `GET /notifications` | 401 | La ruta responde y pide sesión |

### APK

- **APK actual** (development-staging de #44, `main` `c95faeb`): con Metro corre todo el JavaScript de esta rama. Hay tres excepciones:
  - **Grabación de audio:** la app abre y la entrevista funciona, pero muestra "Esta versión de la app no puede grabar audio…" y no ofrece grabar.
  - **Textos del componente AWS de prueba de vida:** siguen en inglés. Los textos propios de la app sí salen en español.
  - **Permiso de micrófono:** no existe en ese manifiesto.
- **APK nuevo** (development-staging construido desde esta rama, **no incluido en esta entrega**): agrega `expo-audio` (grabación, sin reproducción en Mobile), el permiso `RECORD_AUDIO` y los textos en español del componente AWS. Sin él no se prueban los pasos marcados como "APK nuevo".

### Datos sintéticos

Nunca usar personas reales. Los correos son alias `+` de un buzón del equipo.

| Dato | Uso |
|---|---|
| Organización **QA-A** | Encuestas: "QA autoaplicada" (respuesta propia, sin audio, con una pregunta numérica de 0 a 80.5) y "QA entrevista" (entrevista, audio opcional, con `consent_text`) |
| Organización **QA-B** | Solo para pruebas de aislamiento |
| **U1** (correo) | Miembro de QA-A y QA-B; encuestador asignado en QA-A |
| **U2** (solo celular) | Requiere API de acceso y SMS |
| **U3** (correo y celular) | Sin organización; invitación pendiente a QA-A |
| **U4** (correo) | Miembro solo de QA-B |

### Evidencia de cada paso

- Grabación de pantalla, o una captura por resultado.
- Hora.
- Modelo de teléfono y versión de Android.
- Identificador del APK y SHA de la rama.
- En encuestas, además: el `client_response_id` y el id de la respuesta en Admin.
- Si algo falla: el log de Metro.

## 2. Pasos en orden

En la columna **Requiere**, "Hoy" significa que funciona con el APK actual, Metro y el staging de hoy.

| # | Paso | Resultado esperado | Requiere |
|---|---|---|---|
| 1 | Abrir el APK actual con Metro de esta rama | La app abre sin "Cannot find native module" | Hoy |
| 2 | Iniciar sesión con correo (U1) | Llega al Inicio de QA-A | Hoy |
| 3 | Campana → bandeja → tocar una notificación | Abre solo la bandeja y su detalle, sin configuración. La notificación queda leída una sola vez | Hoy |
| 4 | Perfil | La configuración de notificaciones está aquí, el tema es claro, "Salir de…" y "Eliminar mi cuenta" aparecen solo tras "Mostrar opciones de cuenta", y el Aviso de privacidad es lo último | Hoy |
| 5 | Prueba de vida | Textos de la app en español; los del componente AWS, en español solo con el APK nuevo | Hoy / APK nuevo |
| 6 | Admin solicita recaptura → abrir Cumplimiento | Aviso de recaptura de prueba de vida | Endpoint de recaptura |
| 7 | Sin sesión: `adb shell am start -W -a android.intent.action.VIEW -d "afilianetmobile://join/<orgId>/<code>" com.afilianet.mobile` → "Ya tengo cuenta" → U3 | Vuelve sola a "Confirma tu invitación" | Hoy |
| 8 | U3: "Unirme con mi cuenta" | Aparece QA-A sin crear otra cuenta | Hoy |
| 9 | Cerrar sesión con una invitación pendiente y entrar con U4 | No se ofrece la invitación | Hoy |
| 10 | Registro directo con correo, con celular y con ambos; código, reenvío con espera, código vencido y 5 intentos fallidos; login y recuperación con celular (U2) | Lo que la app muestra como verificado sale de `/me` | API de acceso + SMS |
| 11 | Cuenta sin organización → "Ver notificaciones" | Bandeja de plataforma | API #45 |
| 12 | Encuestas con `EXPO_PUBLIC_SURVEYS_SOURCE=api`: descargar, modo avión, responder "QA autoaplicada" y luego sincronizar | "Guardado en el dispositivo" → "Pendiente de sincronizar" → "Recibido". Una sola respuesta en Admin | API de encuestas |
| 13 | "QA entrevista": dejar sin responder una obligatoria → "Guardar incompleta" | En Admin, las preguntas que faltan aparecen como `skipped` | API de encuestas |
| 14 | Consentimiento → grabar → recibir una llamada | La grabación se detiene, se conserva y se marca `interrupted`; "Audio pendiente" → "Recibido" | API de encuestas + APK nuevo |
| 15 | Rechazar el consentimiento | No hay micrófono y nunca se sube audio | API de encuestas |
| 15b | Versión con `audio_mode: required`: aceptar el consentimiento sin poder grabar (APK actual, permiso denegado o audio borrado) y tocar "Guardar respuestas" | No se envía: aparece el aviso de que se requiere la grabación (con el APK actual, que hace falta una versión que pueda grabar) y el borrador se conserva. Si la persona rechaza, sí se envía sin audio | API de encuestas |
| 16 | Responder sin conexión, cerrar la versión en Admin y sincronizar | "No se pudo contar: la encuesta cerró…"; se conserva hasta descartarla | API de encuestas |
| 17 | Push de una encuesta de QA-A tocada por U1 | Abre esa encuesta en QA-A | API de encuestas + `e1ce99a` |

### Aislamiento entre cuentas y organizaciones

| # | Paso | Resultado esperado | Requiere |
|---|---|---|---|
| 18 | U1 con pendientes → Cerrar sesión | "Tienes encuestas sin enviar": sincronizar, conservar o borrar (borrar pide confirmación) | API de encuestas |
| 19 | U1 graba unos 10 minutos, toca "Sincronizar ahora" y cierra sesión mientras sube | Al volver con U1: "Audio pendiente". Al sincronizar, **un solo** audio en Admin y nada a nombre de otra cuenta | API de encuestas + APK nuevo |
| 20 | Conservar los pendientes de U1 y entrar con U4 | U4 no ve ni envía borradores ni pendientes de U1 | API de encuestas |
| 21 | Cambiar de QA-A a QA-B con pendientes en QA-A | QA-B no los ve ni los envía | API de encuestas |
| 22 | Push de QA-B tocada por U3 (no es miembro) | No navega a ningún lado | API de encuestas + `e1ce99a` |
| 23 | Alternar el modo avión durante "Sincronizar ahora", tres veces | Un solo recibo y un solo audio por respuesta en Admin | API de encuestas |

## 3. Cubierto solo por pruebas automatizadas (no marcar como probado en teléfono)

- **Arranque sin el módulo nativo de audio:** se evalúan todas las rutas como lo hace expo-router (`old-apk-startup.test.ts`).
- **Cambio de cuenta durante la subida de audio:** no hay `complete` con el token de la otra cuenta, y el reintento no duplica (`apiSource.test.ts`, `outbox.test.ts`).
- **Cierre o cambio de sesión durante peticiones:** detalle de notificación, `refreshUser`, perfil offline y cola de encuestas.
- **Push:** de otra organización, de otro usuario, toques duplicados y toques nuevos durante otra apertura.
- **Idempotencia** de respuestas (reenvío y doble toque) y cola sin envíos duplicados en paralelo.
- **Formas de la API de acceso** (contrastadas en `03c6b8b`) y **de encuestas** (contrastadas en `aa94798` y revisadas contra `93161a3`), incluidos los decimales.
- **`audio_mode: required`:** con el módulo ausente, el permiso denegado, la grabación fallida o el audio borrado, una entrevista aceptada no se envía y se conserva como borrador. El rechazo y la falta de decisión también están cubiertos.

## 4. Bloqueado por infraestructura o proveedor

- **API #50 sin despliegue confirmado:** registro directo, login con celular, código SMS y recuperación por celular (paso 10).
- **SMS apagado según API #50:** recibir cualquier código, aun con la API desplegada.
- **API #45 sin despliegue confirmado:** notificaciones de plataforma (paso 11).
- **API #51 sin despliegue confirmado:** pasos 12 a 23. La vista previa con datos de ejemplo solo prueba el motor del teléfono, no el MVP.
- **`e1ce99a` sin merge:** push a una encuesta (pasos 17 y 22).
- **APK nuevo sin construir:** audio (14 y 19) y textos AWS en español (5).
- **Proveedores de IA:** no hay transcripción ni análisis de calidad (`provider_unavailable`).

## Iniciar Metro con tunnel (PowerShell, staging)

Se ejecuta desde el worktree de integración, no desde la copia principal (que está en `main`). `.env.staging` no está en git: se copia de la copia principal. Se usa `npx.cmd`, porque la política de ejecución de PowerShell puede bloquear `npx.ps1`. Se limpia `EXPO_OFFLINE`: si quedó activo de otra sesión, la CLI de Expo omite sus peticiones de red, y el arranque con tunnel no debe depender de eso. El tunnel usa el `@expo/ngrok` global que ya funcionó; no se cambia su configuración.

```powershell
Set-Location "C:UsersandreHerdAfilianetafilianet-mobile.claudeworktreesmvp-integration"
git fetch origin
git status -sb                      # debe decir: integration/mvp-physical-tests...origin/integration/mvp-physical-tests
git rev-parse HEAD                  # debe coincidir con la cabeza de Mobile #51
Remove-Item Env:EXPO_OFFLINE -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PUBLIC_SURVEYS_SOURCE -ErrorAction SilentlyContinue   # vista previa de encuestas
Copy-Item "C:UsersandreHerdAfilianetafilianet-mobile.env.staging" "..env.staging" -Force
node .scriptsselect-env.js staging
Select-String -Path ..env -Pattern "EXPO_PUBLIC_APP_ENV|EXPO_PUBLIC_API_BASE_URL"   # staging / https://staging-api.afilianet.mx
npx.cmd expo start --dev-client --tunnel --clear
```

Para los pasos 12 a 23, solo cuando el despliegue de API #51 en staging esté confirmado, se detiene Metro (Ctrl+C) y se inicia con la fuente real:

```powershell
Remove-Item Env:EXPO_OFFLINE -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_SURVEYS_SOURCE = "api"
npx.cmd expo start --dev-client --tunnel --clear
```

Para volver a la vista previa con datos de ejemplo: `Remove-Item Env:EXPO_PUBLIC_SURVEYS_SOURCE`, y se reinicia con el primer bloque.

## Correcciones de esta integración

1. **El APK anterior no abría.** Con Metro, el APK anterior no abría la app: expo-router evalúa todas las rutas al iniciar, y la de respuesta importaba `expo-audio`. Ahora `expo-audio` se carga solo si el módulo nativo existe.
2. **La subida de audio no comprobaba la sesión entre pasos.** Ahora se comprueba antes de cada paso. Antes, un cambio de cuenta durante el PUT confirmaba el audio con el token nuevo.
3. **Perfil de una cuenta solo con celular:** muestra el celular en lugar de una línea vacía.
4. **`audio_mode: required` (revisión de #51):** una entrevista con el consentimiento aceptado y sin grabación ya no se envía como completa ni se trata como `optional`; se conserva como borrador. Pasa con el módulo ausente, el permiso denegado, la grabación fallida o el audio borrado. Con el módulo ausente, se explica que hace falta una versión de la app que pueda grabar. El rechazo se sigue enviando sin audio, como indica el contrato, y la falta de decisión ya no cuenta como rechazo.
