# Guion de pruebas físicas del MVP (Mobile integrado)

**Rama:** `integration/mvp-physical-tests`. Contiene, en este orden:
- #47 (`dba4076`);
- #43 (`51c70b1`), integrado en #49;
- #49 (`f48b98f`);
- #50 (`c5e6cbc`);
- tres correcciones de integración (ver al final).

No se mezcla nada en `main`.

**Regla de evidencia:** un paso cuenta como probado en teléfono solo si se ejecutó en un teléfono contra staging. Lo que solo cubren las pruebas automatizadas está en la última sección y no se marca como probado.

## 1. Requisitos

### API en staging

Estado del 2026-10-13, comprobado con peticiones sin credenciales: 404 significa que la ruta no existe.

| Necesario para | Rama de API | Staging hoy |
|---|---|---|
| Login con `identifier` y celular, registro directo, código SMS, recuperación por celular | `feat/unified-account-access` @ `03c6b8b` | **No desplegado**: `/auth/register` y `/auth/phone-verification` dan 404; el login exige `email` |
| Notificaciones de plataforma (cuentas sin organización) | API de #43 | **No desplegado**: `/platform/notifications` da 404 |
| Encuestas | `feat/survey-module` @ `aa94798` | **No desplegado**: `/surveys/*` da 404 |
| Push que abre una encuesta | `fix/notifications-search-concurrency` @ `e1ce99a` | **Sin merge** |
| Recaptura de prueba de vida | `POST /compliance/cases/{case}/retry-liveness` | Sin verificar en esta entrega |
| Código SMS | `SMS_PROVIDER_ENABLED=true` y credenciales de AWS SNS | **Apagado**, sin credenciales |

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
| 11 | Cuenta sin organización → "Ver notificaciones" | Bandeja de plataforma | API de #43 |
| 12 | Encuestas con `EXPO_PUBLIC_SURVEYS_SOURCE=api`: descargar, modo avión, responder "QA autoaplicada" y luego sincronizar | "Guardado en el dispositivo" → "Pendiente de sincronizar" → "Recibido". Una sola respuesta en Admin | API de encuestas |
| 13 | "QA entrevista": dejar sin responder una obligatoria → "Guardar incompleta" | En Admin, las preguntas que faltan aparecen como `skipped` | API de encuestas |
| 14 | Consentimiento → grabar → recibir una llamada | La grabación se detiene, se conserva y se marca `interrupted`; "Audio pendiente" → "Recibido" | API de encuestas + APK nuevo |
| 15 | Rechazar el consentimiento | No hay micrófono y nunca se sube audio | API de encuestas |
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
- **Formas de la API de acceso** (`03c6b8b`) y **de encuestas** (`aa94798`), incluidos los decimales.

## 4. Bloqueado por infraestructura o proveedor

- **API de acceso sin desplegar:** registro directo, login con celular, código SMS y recuperación por celular (paso 10).
- **SMS apagado:** recibir cualquier código, aun con la API desplegada.
- **API de #43 sin desplegar:** notificaciones de plataforma (paso 11).
- **Módulo de encuestas sin desplegar:** pasos 12 a 23. La vista previa con datos de ejemplo solo prueba el motor del teléfono, no el MVP.
- **`e1ce99a` sin merge:** push a una encuesta (pasos 17 y 22).
- **APK nuevo sin construir:** audio (14 y 19) y textos AWS en español (5).
- **Proveedores de IA:** no hay transcripción ni análisis de calidad (`provider_unavailable`).

## Correcciones de esta integración (`017d340`)

1. **El APK anterior no abría.** Con Metro, el APK anterior no abría la app: expo-router evalúa todas las rutas al iniciar, y la de respuesta importaba `expo-audio`. Ahora `expo-audio` se carga solo si el módulo nativo existe.
2. **La subida de audio no comprobaba la sesión entre pasos.** Ahora se comprueba antes de cada paso. Antes, un cambio de cuenta durante el PUT confirmaba el audio con el token nuevo.
3. **Perfil de una cuenta solo con celular:** muestra el celular en lugar de una línea vacía.
