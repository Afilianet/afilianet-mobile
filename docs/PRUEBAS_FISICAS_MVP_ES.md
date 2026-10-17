# Guion de pruebas físicas del MVP (Mobile integrado)

**Rama:** `integration/mvp-identity-processing`, apilada sobre Mobile #51 (`integration/mvp-physical-tests`). Contiene, en este orden:
- #47 (`dba4076`);
- Mobile #43 (`51c70b1`), integrado en #49;
- #49 (`f48b98f`);
- #50 (`c5e6cbc`);
- las correcciones de integración de #51 (ver al final);
- Mobile #45 (`029f761` y `386994a`), procesamiento de identificación, incorporado con `cherry-pick -x`.

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
| Extracción del INE en el primer intento (orden de lectura del OCR, el resultado `Completed` no se revierte, respaldo de IA acotado) | API #46 `fix/identity-first-extraction` | `e590dfc28cf733715b367021f0567f1a30815c44` | Solo cambia el servidor: el resultado que lee Mobile (`DocumentProcessingResult`, con `attempt_number` y `extracted_fields`) no cambia |
| Integración API del MVP (#45/#50, #46, #48, #47, #51/#52, #55/#56, #57) | API #58 `integration/api-mvp` (rama de revisión, «no fusionar») | `93811e3c4f75f6e166063d51e22894e5f59ec255` (verificado por Codex) | CI 38654831193: Composer, Pint, Docker, gates obligatorios y ambos escenarios de migraciones PostgreSQL pasaron. API #60 `9839ad3` hereda esta integración y agrega la corrección OTP (CI 38657040547 verde, con 72 fallas generales toleradas). API #61 `ba9d80d` sigue en revisión: CI 38668314730 fallido en el nuevo gate facial, 38 fallas generales y 23 en ese gate. **Ningún resultado confirma despliegue**: antes de probar, registrar el SHA y digest realmente desplegados y revisar su diferencia con el candidato |
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
- **APK nuevo** (development-staging construido desde la rama `build/dev-staging-audio-liveness`, **aún no construido**; el primer intento, EAS `39cd9486`, falló en Gradle; ver «Candidato del APK»): agrega `expo-audio` (grabación, sin reproducción en Mobile), el permiso `RECORD_AUDIO` y los textos en español del componente AWS. Sin él no se prueban los pasos marcados como "APK nuevo". Cómo construirlo e instalarlo: sección «Construir e instalar el APK development-staging».
- **Candidatos que no se dan por desplegados:** API #60 (`9839ad37c9f60ec8fac6a58aa4b727e5a6ee30f4`) y Admin #44 (`92b0ff16c248e6482e45f7b932c3b398806a82cf`). Admin #45 agrega aislamiento KYC y API #61 continúa la corrección facial; sus resultados deben consultarse antes de escoger un candidato. API #58 `93811e3` ya pasó ambos escenarios de migraciones PostgreSQL; no usar el fallo anterior de SQLite como estado vigente. Antes de probar se confirma qué SHA está realmente desplegado.

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
| **U5** (correo), afiliado de QA-A | Expediente de cumplimiento **nuevo y sintético** para los pasos 5a a 5d. Se usa una identificación de muestra que el equipo autorice, nunca la de una persona real ajena a la prueba |

**El expediente real PERE9728 no se usa, no se reinicia y no se modifica.** Ningún paso de este guion lo toca. Los reintentos se prueban solo con el expediente de U5, y su historial se conserva: no se borran intentos ni se reinicia el caso entre pasos.

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
| 5a | U5 → Cumplimiento → INE → fotografiar frente y reverso → enviar (intento 1) | "Estamos procesando tu identificación", con "Continuar" para salir sin cancelar. Al terminar, en el **primer** intento y sin re-extracción manual en Admin, los campos del INE (nombre, CURP, clave de elector, etc.) aparecen con sus etiquetas y estados en español | API #58 (incluye #46) |
| 5b | Con el intento 1 procesándose: tocar "Continuar", salir de Cumplimiento y volver a abrirlo; luego cerrar la app y reabrirla | Muestra el mismo intento en proceso y converge a su resultado sin pedir otra subida. Si tarda más de un minuto, "Verificar estado" consulta sin crear otro intento | Hoy (el resultado de extracción requiere API #58) |
| 5c | Segunda captura (intento 2) con el intento anterior aún sin asentar. Mobile no ofrece capturar mientras un intento está "procesando", así que se reproduce así: con un intento terminado en "Necesita corrección", tocar "Volver a tomar" y enviar otra vez | Desde el envío se ve el intento 2 "procesando". El resultado anterior ("Necesita corrección") **nunca reaparece** encima del intento nuevo, ni siquiera un instante. Grabar la pantalla desde el envío hasta el resultado. En Admin, el historial conserva los dos intentos (`attempt_number` 1 y 2) | Hoy en Mobile; que el intento 1 termine en corrección y el resultado del 2 requieren API #58 |
| 5d | Prueba de vida | Textos de la app en español; los del componente AWS, en español solo con el APK nuevo | Hoy / APK nuevo |
| 6 | Admin solicita recaptura de prueba de vida **para U5** → abrir Cumplimiento | Aviso de recaptura de prueba de vida. La comparación facial sigue bloqueada hasta completar la nueva sesión; los intentos anteriores siguen en el historial | Endpoint de recaptura (API #58) |
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
- **Procesamiento de identificación (Mobile #45):** una respuesta tardía de un intento anterior nunca reemplaza al intento nuevo (`compliance-document-capture.test.tsx`). "Verificar estado" recupera sin otra subida ni otro intento, y una falla de conexión se distingue de la lentitud. La carrera exacta del paso 5c depende de los tiempos del servidor y en teléfono puede no presentarse; la prueba automatizada sí la fuerza.
- **`audio_mode: required`:** con el módulo ausente, el permiso denegado, la grabación fallida o el audio borrado, una entrevista aceptada no se envía y se conserva como borrador. El rechazo y la falta de decisión también están cubiertos.

## 4. Bloqueado por infraestructura o proveedor

- **API #50 sin despliegue confirmado:** registro directo, login con celular, código SMS y recuperación por celular (paso 10).
- **SMS apagado según API #50:** recibir cualquier código, aun con la API desplegada.
- **API #45 sin despliegue confirmado:** notificaciones de plataforma (paso 11).
- **API #51 sin despliegue confirmado:** pasos 12 a 23. La vista previa con datos de ejemplo solo prueba el motor del teléfono, no el MVP.
- **`e1ce99a` sin merge:** push a una encuesta (pasos 17 y 22).
- **API sin despliegue confirmado:** extracción inicial de INE (5a/5c) y recaptura (6) requieren el código del candidato correspondiente realmente desplegado. API #58 `93811e3` ya pasó migraciones PostgreSQL y está incorporada en #60 `9839ad3`; #61 sigue en revisión con su último CI verificado fallido. Antes de estos pasos, confirmar el SHA y digest vivos con API/Infra y revisar cualquier diferencia. No confundir CI con despliegue ni usar `edfeab4` como referencia actual.
- **APK nuevo sin construir:** audio (14 y 19) y textos AWS en español (5d). La compilación de Gradle y el manifiesto final combinado no se verificaron localmente (la máquina de Ubuntu/WSL no tiene Android SDK, JDK ni `adb`); la primera compilación real será la de EAS.
- **Proveedores de IA:** no hay transcripción ni análisis de calidad (`provider_unavailable`).

## Construir e instalar el APK development-staging (preparado, no ejecutado)

### Candidato del APK

**Código candidato: el commit que corrige el comentario XML de `strings.xml`.** Es el commit que contiene esta versión del guion; su SHA se obtiene así:

```bash
git log -1 --format=%H -- modules/aws-face-liveness/android/src/main/res/values/strings.xml
```

Sustituye a `d62fa00` (código `da7de80`) y a `9bac121`, que ya no son candidatos. El APK se construye desde la cabeza del PR #53. Antes de construirlo hay que confirmar que `git diff --stat <candidato> HEAD` no toca archivos nativos (`android/`, `modules/*/android`, `plugins/`, `app.json`, `app.config.js`, `eas.json`, `package.json`, `package-lock.json`). Los cambios solo de JavaScript (`src/`) los sirve Metro al APK ya construido.

**APK construido:** EAS `35bc0d4e-c498-40c0-b1bb-1cd11f778bcd` desde `284dd69`, `versionCode` 11, `FINISHED` el 2026-10-16. Los commits posteriores que solo cambian JavaScript no requieren otro APK.

**Build fallido de `d62fa00`:** EAS `39cd9486-5de3-4387-b1da-800af359a811` (perfil `development-staging`, 2026-10-16), `ERRORED` / `EAS_BUILD_UNKNOWN_GRADLE_ERROR`.
- **Error:** la tarea `:aws-face-liveness:packageDebugResources` falló en `strings.xml:14:27` con «The string "--" is not permitted within comments».
- **Causa:** el comentario de cabecera decía `values.xml -- re-diff`, y XML no admite `--` dentro de un comentario. Venía de `f23ae20` (#47).
- **Por qué no se detectó antes:** la prueba de textos nativos leía el archivo con una expresión regular, y el prebuild local no compila recursos.
- **Corrección:** el comentario dice ahora `values.xml; re-diff`; los 17 textos no cambian. `livenessNativeStrings.test.ts`, que ya está en el gate de CI, valida todos los XML del módulo (`AndroidManifest.xml` y `strings.xml`) con el parser estricto de Expo (`XML.parseXMLAsync` de `expo/config-plugins`) y lee las 17 traducciones desde el XML ya analizado.
- **Comprobación:** con el comentario original, la prueba falla con «Malformed comment»; con la corrección, pasa.
- **versionCode:** ese intento consumió el `versionCode` 10 (incremento remoto), que no se revierte. El siguiente build usará el 11.

Respecto de `9bac121`, `da7de80` cambia:
- **Face match antes de `current_step`:** la tarjeta ya no queda bloqueada cuando el documento está listo y `current_step` sigue en `biometric_liveness`. Solo se ofrecen la subida de selfie y el procesamiento; el `attempt` genérico y el simulador de desarrollo siguen fuera. Se mantiene bloqueada si el proveedor no está disponible, si falta el documento o durante una recaptura de liveness. Corresponde a API #61 (`548e6a9`), que permite procesar face match antes de completar liveness pero aplica el resultado solo cuando face match pasa a ser el paso actual. **Esto depende de que API #61 esté desplegada.** Con una API que todavía exija `current_step`, el disparo responde con error y la app muestra el mensaje del servidor.
- **Pruebas:** `compliance-face-match` completa entra al gate de CI, y la prueba de logs de subida usa valores centinela.

### Qué incorpora (revisado el 2026-10-14 sobre `f8f1192`; repetido el 2026-10-15 en Ubuntu/WSL sobre `42418a6`)

Respecto de `f8f1192`, `42418a6` solo cambia este guion: el código, `package.json`, el lockfile, `app.json` y `eas.json` son los mismos.

Repetición en Ubuntu/WSL (Node 24.22.0, npm 11.19.1, `npm ci` sin cambiar el lockfile):
- typecheck y lint sin errores;
- `test:build-env` 5/5;
- `check-build-env.mjs` acepta `development-staging` con staging HTTPS y rechaza una URL local;
- las suites del gate de CI de audio, consentimiento, permisos, borradores, aislamiento, arranque del APK anterior y textos de prueba de vida: 17 suites, 134 pruebas;
- prebuild de Android en un directorio desechable, fuera del worktree. **No es una compilación de Gradle.**

La suite completa tenía 23 fallas, todas fuera del gate. Las mismas 23 fallan con idéntico mensaje en `main` (`c95faeb`), cada revisión con su propio `npm ci`. Ninguna es una regresión del candidato. Cada una se atribuyó al commit de `main` que la introdujo:

| Falla | Desde | Causa | Clasificación |
|---|---|---|---|
| 14 de `compliance-face-match` (subida de selfie, 409, 503, privacidad, aislamiento) | `c13e00d` | La subida pasó a `arrayBuffer()` + `expo/fetch`; el mock seguía con `File.upload()` | Prueba desactualizada: mismo mock que ya corrigió `3a49dbd` en `compliance-document-capture` |
| 3 de `compliance-face-match` (`match` sobre paso `pending`) | `e288bc5` (#24) | Un `match` en un paso `pending` es una recaptura y se oculta; la API pasa el paso al completar | Fixture desactualizada: el paso queda `passed` |
| 2 de `compliance-face-match` (insignia en paso `passed`) | `6109768` (#33) | Insignias de verificación uniformes | Texto desactualizado |
| 1 de `compliance-face-match` (falla técnica) | `8e2b7e4` (#23) | Nuevo texto «Verificación temporalmente no disponible» | Texto desactualizado |
| `compliance-liveness` (veredicto `review`) | `e288bc5` (#24) | Un `review` en paso `pending` es recaptura; la API resuelve `review` como paso `passed` | Fixture desactualizada |
| `compliance-production-safety` (términos) | `3f69adb` (#2) | Orden obligatorio: se bloquea el paso que no es `current_step` | Fixture desactualizada |
| `OrganizationProvider` (invalidaciones) | `c7eeadb` | 3 dominios de inquilino nuevos (`assisted-*`) | Prueba desactualizada; ahora verifica los 10 |
| `compliance-face-match` «current_step never gates…» | `3f69adb` (#2) | La prueba usaba un `current_step` imposible; #2 bloqueaba también face match | Resuelto en `da7de80`: excepción de procesamiento según API #61 y cuatro escenarios reales |
| `compliance-face-match` «never logs … any upload header» | `3835a45` | El diagnóstico `__DEV__` registra los nombres (no los valores) de las cabeceras firmadas, como está permitido | Resuelto en `da7de80`: centinelas de valores, URL firmada, URI y bytes; diagnóstico positivo; nada fuera de `__DEV__` |

Tras las correcciones, `compliance-liveness`, `compliance-production-safety`, `OrganizationProvider` y `compliance-face-match` (58/58) pasan completas y están en el gate de CI. Suite completa en `da7de80`: 73/73 suites y 738/738 pruebas. En la copia principal, face-match no arrancaba por su `node_modules` (no resolvía `aws-face-liveness`), un problema del entorno; con `npm ci` limpio sí arranca.

| Necesidad | Dónde queda | Cómo se comprobó |
|---|---|---|
| Módulo nativo de grabación | `expo-audio` 57.0.5 en `package.json` y lockfile; plugin `expo-audio` en `app.json` (`recordAudioAndroid: true`, sin grabación ni reproducción en segundo plano) | Versión esperada por SDK 57 (`expo install --check` no la marca); prebuild local en un worktree desechable |
| Permiso de micrófono | `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` en el manifiesto; ningún `tools:node="remove"` lo quita | Manifiesto generado por el prebuild desechable. `expo-image-picker` ya no bloquea el micrófono |
| Consentimiento explícito antes de grabar | JavaScript: no hay botón de micrófono hasta "La persona acepta que se grabe"; el permiso del sistema se pide al tocar "Iniciar grabación"; rechazar sigue permitido | Pruebas de `survey-response` y `useInterviewRecorder` (Jest) |
| Textos nativos de prueba de vida en español | `modules/aws-face-liveness/android/src/main/res/values/strings.xml` | Mismas 17 claves que el AAR público `com.amplifyframework.ui:liveness:1.11.0` (Maven Central; el AAR solo trae inglés y no tiene `values-*`) |
| API HTTPS de staging | `eas.json`, perfil `staging` (heredado): `EXPO_PUBLIC_API_BASE_URL=https://staging-api.afilianet.mx`, `EXPO_NO_DOTENV=1` | `scripts/check-build-env.mjs`, que EAS ejecuta antes de instalar, pasa con `EAS_BUILD_PROFILE=development-staging` y rechaza otra URL |
| Arranque y conexión por tunnel | `developmentClient: true`, `expo-dev-client` 57.0.18, esquema `exp+afilianet-mobile` en el manifiesto | Prebuild desechable. El tunnel usa `@expo/ngrok` global, como con el APK de #44; en Ubuntu/WSL está instalado `@expo/ngrok` 4.1.3 (ver «Iniciar Metro con tunnel») |
| El APK anterior sigue arrancando | `expo-audio` se carga solo si existe su módulo nativo (`audioSupport.ts`) | `old-apk-startup.test.ts` (Jest y CI) |

**No se comprobó localmente:** la compilación de Gradle y el manifiesto final combinado, porque la máquina de Ubuntu/WSL no tiene Android SDK ni JDK. La primera compilación real será la de EAS. CAMERA llega por el manifiesto de `expo-image-picker`. Los textos que la librería de AWS tenga escritos directamente en su código no se pueden reemplazar con `strings.xml`; si alguno sale en inglés en el teléfono, se anota.

### Orden

1. Con el **APK actual (#44)**, hacer antes el paso 1 del guion: la app abre con Metro sin el módulo de audio. Al instalar el APK nuevo, esa prueba ya no se puede repetir en ese teléfono.
2. Sincronizar o confirmar que no quedan encuestas pendientes en el teléfono.
3. Construir, instalar y hacer las comprobaciones de abajo.
4. Antes de los pasos que dependen del backend, registrar el SHA y el digest de API realmente desplegados en staging. No dar por desplegados API #60 ni #61.

### Comando (Ubuntu/WSL; no ejecutado en esta entrega)

```bash
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/apk-dev-staging
git fetch origin build/dev-staging-audio-liveness
git status -sb          # limpio: build/dev-staging-audio-liveness...origin/build/dev-staging-audio-liveness
git rev-parse HEAD      # anotar el SHA del que sale el APK; debe ser la cabeza del PR #53
C=$(git log -1 --format=%H -- modules/aws-face-liveness/android/src/main/res/values/strings.xml)
git diff --stat "$C" HEAD -- android modules plugins app.json app.config.js eas.json package.json package-lock.json   # vacío: lo nativo es el del candidato
unset EXPO_OFFLINE
npm ci                  # solo desde el lockfile; eas build evalúa los plugins de app.json con estas dependencias
eas --version           # eas-cli 24.8.0, instalado en ~/.local; eas.json exige >= 16
eas whoami              # debe listar la cuenta afilianet; si no hay sesión: eas login
eas build --platform android --profile development-staging
```

- Se usa el `eas-cli` instalado en la máquina, no otra versión de Expo. Si avisa de una versión nueva, no se actualiza por rutina. EAS instala las dependencias con `npm ci` desde el lockfile.
- El perfil hereda de `staging`:
  - `autoIncrement` sube el `versionCode`;
  - las variables del entorno «preview» de EAS se aplican, incluido `GOOGLE_SERVICES_JSON` para push, como en el APK de #44;
  - el `.env` local no se usa (`EXPO_NO_DOTENV=1`).
- Se anotan el enlace o id del build, el `versionCode` y el SHA.

### Instalar

- Abrir en el teléfono el enlace del build de EAS, descargar el APK e instalarlo **encima** del anterior. Con la misma firma de EAS, Android conserva los datos.
- Si Android pide desinstalar por una firma distinta, **no desinstalar** sin antes sincronizar o confirmar que no hay pendientes: desinstalar borra los borradores y la cola de encuestas.

### Comprobaciones físicas del APK nuevo

1. **Arranque:** abrir la app sin Metro → aparece el lanzador del cliente de desarrollo. Iniciar Metro con tunnel (sección siguiente) y abrir su URL → carga la app en tema claro.
2. **Permiso declarado:** Ajustes de Android → Apps → Afilianet → Permisos: aparece Micrófono, sin conceder.
3. **Consentimiento antes del micrófono:** en «QA entrevista», antes de "La persona acepta que se grabe" no hay control de micrófono. Después, "Iniciar grabación" pide el permiso del sistema la primera vez.
4. **Permiso denegado:** aparece el mensaje y "Abrir configuración". Con audio opcional se puede continuar sin audio; con audio requerido queda como borrador (paso 15b).
5. **Grabar:** grabar 30 s y detener → "Audio guardado en el teléfono". Repetir y recibir una llamada a mitad → se detiene, se conserva y se marca como interrumpida.
6. **Rechazo:** con "Continuar sin grabar" no hay micrófono y la respuesta se envía sin audio.
7. **Aislamiento y borradores:** dejar un borrador con audio, activar el modo avión y reiniciar la app → el borrador sigue. Cambiar a otra cuenta → no lo ve.
8. **Prueba de vida en español (U5):** las pantallas del componente AWS muestran, entre otros, "Comenzar verificación con video", "Advertencia de fotosensibilidad", "Acércate", "Aléjate", "No te muevas" y "Verificando". Anotar con captura cualquier texto que siga en inglés.
9. **Staging HTTPS:** iniciar sesión con correo contra staging, sin error de red.

## Iniciar Metro con tunnel (Ubuntu/WSL, staging)

Se ejecuta desde el worktree de esta rama, no desde la copia principal (que está en `main` y cuyo `node_modules` no incluye `expo-audio`). El código es el mismo que el de `mvp-identity` (`f8f1192`); solo cambia este guion.

- **`.env.staging`** no está en git: se copia de la copia principal.
- **`EXPO_OFFLINE`:** se limpia. Si quedó activo de otra sesión (el lanzador local lo define), la CLI de Expo omite sus peticiones de red, y el arranque con tunnel no debe depender de eso.
- **Puerto:** el lanzador `migracion-config/bin/afilianet-mobile.sh` puede tener otro Metro en 127.0.0.1:8081, apuntando a la API local. Ese Metro **no se detiene**: este usa el 8082. Con tunnel, el teléfono entra por la URL de ngrok, no por el puerto.
- **Tunnel:** la CLI de Expo 57 usa ngrok y requiere `@expo/ngrok@^4.1.0` **global**. En Ubuntu/WSL está instalado `@expo/ngrok@4.1.3` en el prefijo de Node del usuario (`~/.local/opt/node-v24.22.0-linux-x64`), fuera de `package.json` y del lockfile; el resolvedor de la CLI lo encuentra sin preguntar. No se cambia su configuración.

```bash
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/apk-dev-staging
git fetch origin build/dev-staging-audio-liveness
git status -sb                      # debe decir: build/dev-staging-audio-liveness...origin/build/dev-staging-audio-liveness
git rev-parse HEAD                  # debe coincidir con la cabeza del PR #53 y con el SHA del APK
unset EXPO_OFFLINE
unset EXPO_PUBLIC_SURVEYS_SOURCE    # vista previa de encuestas
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
grep -E '^EXPO_PUBLIC_(APP_ENV|API_BASE_URL)=' .env   # staging / https://staging-api.afilianet.mx
npx expo start --dev-client --tunnel --clear --port 8082
```

Para los pasos 12 a 23, solo cuando el despliegue de API #51 en staging esté confirmado, se detiene **este** Metro (Ctrl+C en su terminal) y se inicia con la fuente real:

```bash
unset EXPO_OFFLINE
EXPO_PUBLIC_SURVEYS_SOURCE=api npx expo start --dev-client --tunnel --clear --port 8082
```

Para volver a la vista previa con datos de ejemplo, se reinicia con el primer bloque (sin `EXPO_PUBLIC_SURVEYS_SOURCE`).

El paso 7 usa `adb`, que esta máquina no tiene. Hay dos opciones: instalar las platform-tools de Android, o abrir el enlace `afilianetmobile://join/<orgId>/<code>` desde el propio teléfono.

## Correcciones de esta integración

1. **El APK anterior no abría.** Con Metro, el APK anterior no abría la app: expo-router evalúa todas las rutas al iniciar, y la de respuesta importaba `expo-audio`. Ahora `expo-audio` se carga solo si el módulo nativo existe.
2. **La subida de audio no comprobaba la sesión entre pasos.** Ahora se comprueba antes de cada paso. Antes, un cambio de cuenta durante el PUT confirmaba el audio con el token nuevo.
3. **Perfil de una cuenta solo con celular:** muestra el celular en lugar de una línea vacía.
4. **`audio_mode: required` (revisión de #51):** una entrevista con el consentimiento aceptado y sin grabación ya no se envía como completa ni se trata como `optional`; se conserva como borrador. Pasa con el módulo ausente, el permiso denegado, la grabación fallida o el audio borrado. Con el módulo ausente, se explica que hace falta una versión de la app que pueda grabar. El rechazo se sigue enviando sin audio, como indica el contrato, y la falta de decisión ya no cuenta como rechazo.
5. **Procesamiento de identificación (Mobile #45, en `integration/mvp-identity-processing`):** se incorporó con `cherry-pick -x` sin conflictos de texto.
   - `useDocumentResult` descarta una respuesta de un intento anterior (`attempt_number` menor) que llegue después del intento nuevo.
   - Corrige el mock de subida de evidencia y los fixtures de bloqueo de pasos.
   - Agrega `compliance-document-capture.test.tsx` y `compliance.test.tsx` al gate de CI.
   - Se conservan la recaptura de prueba de vida (su gate sigue igual) y los textos de identificación en español.
6. **Ruta del primer bloque de PowerShell:** en #51 la ruta quedó sin barras invertidas (`C:UsersandreHerd…`). Aquí se corrigió, y el bloque apunta al worktree `mvp-identity`.
7. **Pregunta abierta de la encuesta (hallazgo en tablet, APK anterior + Metro de `284dd69`):** al tocar «¿Algo más que quieras contarnos?» aparecía el teclado, pero el campo no conservaba el texto.
   - **Defecto demostrado:** al salir de la pantalla dentro de los 600 ms del autoguardado, el temporizador se cancelaba y se perdía lo último escrito; al volver, se mostraba el borrador anterior. Ahora el guardado pendiente se completa al salir, siempre en la cuenta y organización del borrador, y nunca después de enviar la respuesta.
   - **Defecto de presentación:** el área multilínea tenía la altura fija de 44 de un campo de una línea, lo que puede recortar el texto en Android (relleno superior y tamaño de fuente del sistema). Ahora mide al menos 96, crece con el texto y alinea arriba.
   - **No reproducido en pruebas:** con el valor controlado y `onChangeText`, el texto escrito carácter a carácter se conserva y se autoguarda. No hay recarga del borrador mientras se escribe. Si en la tablet sigue fallando, hace falta una grabación de pantalla para distinguir si las letras aparecen y desaparecen o nunca se ven, el teclado usado, el tamaño de fuente y de pantalla de Android, y si en el campo numérico de la misma encuesta sí se puede escribir. Metro no recibe los logs de consola del dispositivo.
   - **Audio en el APK anterior:** sin el módulo nativo, la app muestra «Esta versión de la app no puede grabar audio», que atribuye el problema a la versión del APK y no al micrófono del dispositivo. «Sin permiso de micrófono» solo aparece con el permiso denegado.
8. **Reabrir una respuesta (hallazgo en tablet tras `3bc75f6`):** ya se podía escribir y guardar, pero la respuesta no se podía reabrir: solo se identificaba por la hora y al tocarla no ocurría nada.
   - **Dos estados distintos:** un *borrador* (sin enviar) se autoguarda y es editable. Una *respuesta guardada* («Guardar respuestas» o «Guardar incompleta») pasa a «Envíos» y, a propósito, ya no es editable.
   - **Defecto demostrado:** la pila nativa mantiene montada la lista bajo la respuesta, y esa lista solo se cargaba al montarse. Al volver, el borrador recién creado o editado no aparecía hasta salir y entrar de nuevo. Además, la lista principal no mostraba borradores.
   - **Corrección:** el detalle de la encuesta y la lista principal recargan los borradores al recuperar el foco. Cada borrador se muestra con la insignia «Borrador», «Sin enviar · guardado …», el progreso («N de M respondidas») y el botón «Continuar». Las respuestas guardadas en «Envíos» indican «Guardada para enviar; ya no se puede editar.» y, si quedaron incompletas, «Incompleta: N preguntas obligatorias sin responder».
   - **Prueba de integración:** `survey-draft-resume.test.tsx` usa la librería real con la pila simulada. Cubre crear un borrador incompleto con texto y número, salir, verlo como «Borrador» en ambas listas, «Continuar», recuperar los valores y seguir editando. También comprueba que una respuesta guardada (completa o incompleta) no se ofrece para continuar, y el aislamiento por organización. Sin la corrección fallan las 4 pruebas.
