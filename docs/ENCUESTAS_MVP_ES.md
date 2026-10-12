# Encuestas en Mobile (MVP, vista previa)

## Estado del contrato

**afilianet-api no tiene ni planea por ahora un contrato de encuestas** (lo confirmó la sesión de API el 12 de octubre de 2026). Por eso:

- Mobile funciona contra datos de ejemplo (`src/features/surveys/fixtureSource.ts`), igual que afilianet-admin (`feat/admin-surveys` @ `265f3e5`).
- Los tipos (`types.ts`) siguen los tipos provisionales de Admin para que ambos converjan en un solo contrato.
- Las pantallas siempre muestran un aviso: "Vista previa con datos de ejemplo… Lo que respondas no sale del teléfono".
- En la fuente de ejemplo hay dos cosas reales, para que la prueba física tenga sentido:
  - **La conexión:** antes de cada llamada se intenta alcanzar el host real de la API. En modo avión o con red intermitente falla igual que fallaría el servidor de verdad.
  - **La idempotencia:** el servidor simulado recuerda `client_response_id` y `client_audio_id` aunque se reinicie la app.
- **Activación:** está desactivado en producción y activo en development, internal y staging (`features/surveys/flags.ts`). También se activa con `EXPO_PUBLIC_SURVEYS_PREVIEW=1`.

El motor es independiente del transporte (`SurveySource`): almacenamiento cifrado, cola, audio, estados y protecciones de sesión. Cuando exista el contrato, se agrega una fuente HTTP y se cambia una línea en `runtime.ts`.

## Qué hace Mobile

- **Bandeja** (`/surveys`, desde Inicio y desde push):
  - Con conexión actualiza la lista y la guarda cifrada.
  - Sin conexión muestra la última lista e indica de qué fecha es.
- **Descarga explícita:** "Descargar para usar sin conexión" guarda la versión del cuestionario.
  - La bandeja indica "Disponible sin conexión (descargada el …)" o que la descarga está desactualizada.
  - **Sin descarga previa no se puede responder sin conexión:** nada se descarga a mitad de una encuesta.
- **Modalidades:**
  - **Respuesta propia.**
  - **Entrevista:** solo si el servidor indica `interviewer_authorized`. Incluye una referencia opcional de la persona entrevistada, sin datos sensibles.
- **Formulario:** opción única, opción múltiple, escala y texto. Valida al guardar, autoguarda el borrador y permite reanudarlo (también después de reiniciar la app) o descartarlo.
- **Audio** (solo en entrevistas con grabación habilitada):
  - **Consentimiento primero:** el botón del micrófono no existe hasta que se acepta.
  - **Indicador visible:** "● Grabando · m:ss" con botón Detener.
  - **Sin grabación en segundo plano:** si llega una llamada, se bloquea la pantalla o la app pasa a segundo plano, la grabación se detiene y se conserva lo grabado, marcado como interrumpido.
  - **Permiso denegado:** se explica y se ofrece "Abrir configuración". La entrevista puede seguir sin audio.
  - **Límites:** 30 minutos como máximo, AAC mono a 64 kbps (unos 0.5 MB por minuto).
- **Almacenamiento protegido:**
  - Cada respuesta, audio, borrador y cuestionario se cifra con AES y su propia clave en Keychain/Keystore.
  - Todo queda en el directorio privado de la app, en `afn-surveys/{cuenta}/{organización}/`.
  - **Límites de espacio:** 300 MB por cuenta y organización, y nunca se deja el teléfono con menos de 200 MB libres. Si no cabe, se avisa antes de grabar o guardar.
- **Cola persistente** (`outbox.ts`):
  - Primero se envían todas las respuestas; después, los audios.
  - Cada envío lleva un identificador generado una sola vez en el teléfono.
  - Reintenta con espera creciente; "Sincronizar ahora" fuerza el envío.
  - La copia local se borra **solo cuando el servidor confirma**.
  - Si cambia la sesión o la organización, se detiene antes de la siguiente petición y nunca envía ni atribuye pendientes de una cuenta u organización a otra.
- **Estados distintos:**
  - "Guardado en el dispositivo";
  - "Pendiente de sincronizar";
  - "Audio pendiente";
  - "Recibido";
  - "No se puede enviar: la encuesta cerró": se conserva hasta que la persona decide descartarlo.
- **Cierre de sesión con pendientes:** se informa por organización y se ofrece:
  - sincronizar;
  - conservar (cifrado, y solo se envía al volver a entrar con la misma cuenta);
  - borrar, con confirmación;
  - cancelar.

  Nunca se pierde nada en silencio. Un cierre forzado (sesión vencida) conserva los datos.
- **Push:** las push de encuesta abren la encuesta dentro de su organización, con las mismas protecciones de sesión que las notificaciones (#47). La app dice explícitamente que **los avisos solo llegan con internet**.
- **Transcripción y análisis:** ocurren en el servidor después de sincronizar. El teléfono no transcribe.

## Contrato que Mobile necesita de afilianet-api

1. `GET /api/v1/surveys/assignments` (con sesión y `X-Organization-ID`) → `{data: SurveyAssignment[]}`:
   - `survey_id`, `title`, `current_version_id`, `current_version`, `modality`;
   - `status` (`open` o `closed`), `closes_at`, `interviewer_authorized`.
2. `GET /api/v1/surveys/{survey}/versions/{version}` → una versión inmutable y publicada:
   - `questions[]` con `id`, `type`, `prompt`, `required`, `options[]` y `scale{min,max}`;
   - `modality` y `recording{enabled, consent_text}`.
3. `POST /api/v1/surveys/{survey}/responses`:
   - Recibe `client_response_id`, `version_id`, `modality`, `respondent_label`, `answers[]`, `completed_at`, `recording_consent` y `audio_expected`.
   - **Es idempotente por `client_response_id`:** repetir devuelve el mismo `response_id`.
   - Responde `{response_id, received_at}`.
   - Si la encuesta está cerrada, responde 409 con `reason: "survey_closed"`.
4. Audio de una respuesta: `POST /api/v1/surveys/responses/{response}/audio`, preferentemente con URL prefirmada, como la evidencia.
   - **Es idempotente por `client_audio_id`.**
   - Solo responde con éxito cuando el archivo está guardado de forma duradera.
   - Incluye `duration_ms` e `interrupted`.
5. Push de encuesta: `data` con `screen: "surveys"`, `organization_id` y, opcionalmente, `survey_id`.
6. La transcripción y el análisis los dispara el servidor al recibir el audio.

## Requiere un APK nuevo

Metro no reemplaza cambios nativos. Para grabar audio hace falta un nuevo development-staging APK (`eas build -p android --profile staging` o el perfil de development-staging), porque:

- Se agregó `expo-audio@~57.0.5`, un módulo nativo. Es la única dependencia nueva y se instaló con `npx expo install`.
- `app.json` cambió en tres puntos:
  - Se agregó el plugin `expo-audio`: `RECORD_AUDIO` en Android y `NSMicrophoneUsageDescription` en iOS, sin grabación ni reproducción en segundo plano.
  - **`expo-image-picker` dejó de bloquear el micrófono.** Antes tenía `microphonePermission: false`, que en Android **elimina** `RECORD_AUDIO` del manifiesto, así que ningún APK anterior puede grabar.
  - Permisos resultantes nuevos: `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`. No se agregan servicios en primer plano.
- El almacenamiento usa `expo-file-system`, `expo-crypto` y `expo-secure-store`, que ya están en el APK actual. Las encuestas sin audio funcionan con Metro sobre el APK actual.

## Guion de prueba física (Android)

**Requisitos:**
- APK nuevo instalado.
- Sesión con una cuenta que pertenezca a dos organizaciones (A y B).
- Inicio → "Encuestas".

1. **Descarga y modo avión:**
   - Con conexión, abrir "Satisfacción con el servicio (ejemplo)" → "Descargar para usar sin conexión". Debe mostrar "Disponible sin conexión (descargada el …)".
   - Activar modo avión y volver a la bandeja: debe mostrar "Sin conexión. Mostrando la lista guardada el …".
   - Responder con "Responder yo" y guardar. En Envíos debe aparecer "Guardado en el dispositivo" y, tras el primer intento, "Pendiente de sincronizar".
2. **Sin descarga no hay captura offline:** en modo avión, abrir "Entrevista vecinal (ejemplo)" sin haberla descargado. "Iniciar entrevista" debe estar deshabilitado y debe verse "Descárgala antes de responder…".
3. **Reinicio de la app:** con un pendiente en modo avión, forzar la detención de la app y abrirla de nuevo. Envíos debe seguir mostrando el pendiente, y el borrador a medio contestar debe poder reanudarse con "Continuar borrador".
4. **Red intermitente:** quitar el modo avión. Al volver a la app o con "Sincronizar ahora" debe cambiar a "Recibido". Alternar modo avión durante "Sincronizar ahora": lo que no se confirmó sigue pendiente y se reintenta.
5. **Envío duplicado:** tocar "Sincronizar ahora" varias veces seguidas; solo debe haber un recibo por respuesta. Para simular una respuesta perdida, activar modo avión justo después de tocar Sincronizar: al reintentar, el servidor devuelve la misma respuesta y no crea una nueva.
6. **Encuesta cerrada:** descargar "Satisfacción" y responder en modo avión. Todavía sin conexión, tocar "Simular cierre de esta encuesta (ejemplo)" en el detalle (el control de ejemplo no usa la red). Después quitar el modo avión y sincronizar.
   - Debe mostrar "No se puede enviar: la encuesta cerró" y conservarse.
   - "Descartar del teléfono" pide confirmación.
   - "Reabrir esta encuesta (ejemplo)" deshace el cierre.
7. **Grabación y consentimiento:** descargar "Entrevista vecinal" → "Iniciar entrevista".
   - No debe haber botón de micrófono hasta tocar "La persona acepta que se grabe".
   - "Iniciar grabación" pide el permiso del sistema y luego muestra "● Grabando · m:ss".
   - "Detener grabación" muestra "Audio guardado en el teléfono".
8. **Audio interrumpido:** mientras se graba, recibir una llamada o pulsar Inicio. Al volver debe decir "La grabación se detuvo por una interrupción… Se conservó lo grabado".
   - Guardar respuestas y sincronizar con conexión: primero "Audio pendiente", luego "Recibido".
9. **Permiso denegado:** en Ajustes, negar el micrófono a Afilianet e intentar grabar. Debe aparecer el mensaje, "Abrir configuración", y la entrevista debe poder continuar sin audio.
10. **Poco almacenamiento:** llenar el teléfono hasta que queden menos de 200 MB libres e intentar grabar o guardar. Debe avisar "Tu teléfono tiene poco espacio libre…" sin pedir el micrófono ni perder lo ya guardado.
11. **Cambio de organización:** con pendientes en A, cambiar a B. La bandeja y Envíos de B no deben mostrar ni enviar nada de A. Al volver a A, los pendientes siguen ahí.
12. **Logout con pendientes:** con pendientes, Perfil → "Cerrar sesión" debe abrir "Tienes encuestas sin enviar", con el detalle por organización.
    - "Cerrar sesión y conservarlas": al entrar con **otra** cuenta no se ven ni se envían.
    - Al volver a la cuenta original, siguen y se sincronizan.
    - "Cerrar sesión y borrarlas" pide confirmación.
13. **Push:** con una push de encuesta (cuando exista el envío real desde Admin/API), tocarla abre la encuesta en su organización. Sin internet no llega ninguna push: es el comportamiento esperado y la app lo indica.
