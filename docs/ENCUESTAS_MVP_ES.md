# Encuestas en Mobile (MVP)

## Contrato

- **Fuente del contrato:** afilianet-api, rama `feat/survey-module` @ `c390e46`, archivo `docs/surveys/SURVEY_CONTRACT.md`. **Sin merge ni despliegue.** Se reconcilió con los tipos provisionales de Admin #37 y de este PR; la comparación detallada está más abajo.
- **Dónde lo usa Mobile:** `src/features/surveys/` (`types.ts`, `source.ts`, `apiSource.ts`).
- **Fuentes de datos:** detrás de la misma interfaz (`SurveySource`) hay dos.
  - **`apiSource`, la API real.** Se activa con `EXPO_PUBLIC_SURVEYS_SOURCE=api` una vez que el módulo esté desplegado en el entorno.
  - **`fixtureSource`, datos de ejemplo** (opción por defecto mientras la API no esté desplegada). Sigue las formas y reglas del contrato. La UI muestra siempre "Vista previa con datos de ejemplo".
  - La conexión sí es real: el modo avión y la red intermitente se comportan como con el servidor. La idempotencia también persiste aunque se reinicie la app.
- **Activación de la función:** desactivada en producción, activa en development, internal y staging, o con `EXPO_PUBLIC_SURVEYS_PREVIEW=1`.

**Las pruebas con datos de ejemplo no validan el MVP completo.** Solo prueban el motor del dispositivo contra las reglas del contrato. La validación real necesita la API desplegada.

## Qué hace Mobile

- **Bandeja:** `GET /surveys/available`. Muestra solo las versiones abiertas; una encuesta que cerró desaparece en la siguiente actualización. Sin conexión se muestra la última lista guardada, con su fecha.
- **Descarga explícita:** `GET /surveys/versions/{version}` guarda el cuestionario completo cifrado, y la app indica "Disponible sin conexión". **Sin descarga previa no se puede responder sin conexión.**
- **Modalidades:**
  - "Responder yo" (`self`) si la versión lo permite.
  - "Iniciar entrevista" (`interviewed_external`) solo si la versión lo permite **y** el servidor dice que este usuario es encuestador asignado (`is_assigned_surveyor`).
  - No se guarda ninguna identidad de la persona entrevistada.
- **Preguntas:** opción única y múltiple (`value_choice_ids`), texto, número decimal con hasta 2 cifras y escala de enteros. Los rangos son inclusivos y se validan en el teléfono; el servidor no los impone.
- **Completitud** (decisión de producto):
  - la respuesta propia exige todas las obligatorias;
  - una entrevista puede guardarse incompleta después de un aviso explícito, y lo que falta se envía como `skipped`.
  - Una respuesta mal formada (por ejemplo, un número fuera de rango) no se guarda en ningún caso.
- **Borradores:** se guardan solos y se pueden retomar, también después de reiniciar la app.
- **Consentimiento y audio** (solo entrevistas de versiones con `audio_mode` distinto de `none`):
  - Se muestra `consent_text`; si falta, se indica qué explicar.
  - La decisión es irreversible: `consent_audio` es `accepted` o `declined`, y `consent_version` es el id de la versión (regla del contrato).
  - El botón del micrófono no existe hasta que se acepta.
  - Mientras graba se ve el indicador con un botón para detener. No graba en segundo plano: una llamada o el paso a segundo plano detienen la grabación y conservan lo grabado, marcado como `interrupted`.
  - Si se niega el permiso, se ofrece "Abrir configuración".
  - Máximo 30 minutos, en AAC mono a 64 kbps.
  - **Si se rechaza el consentimiento, el audio nunca se envía.**
- **Almacenamiento protegido:** cada archivo se cifra con AES y su propia clave en Keychain/Keystore, por cuenta y organización. Límites locales: 300 MB por alcance y al menos 200 MB libres en el teléfono.
- **Cola** (`outbox.ts`):
  - Primero las respuestas y después el audio.
  - `client_response_id` se genera en el teléfono; el servidor devuelve la respuesta original ante un reenvío.
  - La copia local se borra solo tras la confirmación.
  - Reintentos con espera creciente.
  - Si cambia la sesión o la organización, se detiene antes de la siguiente petición.
  - **Audio en 3 pasos:** sesión de subida, PUT prefirmado y `complete` con `duration_seconds` e `interrupted`. Un fallo reinicia con una sesión nueva.
  - **Los límites de audio se leen del servidor** (`GET /surveys/audio-config`), nunca se fijan en el código.
- **Estados distintos:** "Guardado en el dispositivo", "Pendiente de sincronizar", "Audio pendiente", "Audio no aceptado", "Recibido" y bloqueado por alguno de estos motivos:
  - `survey_version_closed`: "No se pudo contar…";
  - `not_assigned_surveyor`;
  - `respondent_type_not_allowed`;
  - un 403 por no tener perfil de afiliado en la organización.

  Lo bloqueado nunca se reenvía automáticamente; se conserva hasta que la persona lo descarta.
- **Cierre de sesión con pendientes:** se informa y se ofrece sincronizar, conservar (solo para esta misma cuenta) o borrar, con confirmación.
- **Push:** `{screen: "surveys", organization_id, survey_id, version_id}` (sin `title`) abre la encuesta en su organización, con las protecciones de sesión de #47. Los avisos solo llegan con internet. API ya envía ese payload al teléfono en `fix/notifications-search-concurrency` @ `e1ce99a`, todavía sin merge.
- **Transcripción y análisis de calidad:** ocurren en el servidor después de recibir el audio.

## Comparación con la vista previa anterior (antes de conectar)

| Tema | Vista previa anterior de Mobile | Contrato `c390e46`, adoptado |
|---|---|---|
| Tipos de pregunta | `open_text`; sin `number`; `scale{min,max}`; ids de texto | `text`; `number` decimal (2 cifras); `scale_min`/`scale_max` enteros; ids enteros, con `uuid` y `position` |
| Respuestas | `value` genérico | `value_choice_ids` / `value_text` / `value_number` / `skipped` |
| Modalidad | una sola modalidad | `allows_self_response` + `allows_interview_response`; `respondent_type` |
| Persona entrevistada | etiqueta opcional | sin identidad (se eliminó) |
| Encuesta cerrada | 409 `survey_closed` | 422 `survey_version_closed`, guardada como `rejected_closed` |
| Audio | un solo paso, `client_audio_id`, `duration_ms` | 3 pasos, sesión por intento, `duration_seconds`, `interrupted` |
| Consentimiento | booleano | `consent_audio` + `consent_version` (= id de la versión); `consent_text` en la versión |
| Bandeja | lista de asignaciones | `GET /surveys/available` con `is_assigned_surveyor` |
| Límites de audio | 16 MB fijos | `GET /surveys/audio-config` (por defecto 15 MB) |

## Pendientes fuera de Mobile

- **Despliegue:** el módulo de encuestas de la API no tiene merge ni despliegue. Hasta entonces Mobile usa la vista previa.
- **Push:** el envío de `survey_id` y `version_id` al teléfono ya está corregido en API `fix/notifications-search-concurrency` @ `e1ce99a`, todavía sin merge ni despliegue. Mientras no se despliegue, abrir una encuesta desde la push no funcionará.
- **Números decimales:** `number_min` y `number_max` llegan como texto (`"0.00"`) porque son columnas decimales de PostgreSQL sin cast. Mobile los normaliza al descargar la versión (`normalizeVersion`).
- **Proveedores de IA:** no hay proveedor real de transcripción ni de análisis de calidad; la API responde `provider_unavailable`.

## Requiere un APK nuevo

Metro no reemplaza cambios nativos. Grabar audio requiere un nuevo development-staging APK por tres cambios:
- se agregó `expo-audio@~57.0.5`;
- `app.json` incluye el plugin `expo-audio`;
- `expo-image-picker` ya no bloquea `RECORD_AUDIO`. Antes tenía `microphonePermission: false`, que eliminaba ese permiso del manifiesto de Android.

Lo demás funciona con Metro sobre el APK actual.

## Guion de prueba física

**A. Con la vista previa** (APK nuevo, sesión con dos organizaciones). Prueba el motor del dispositivo, no el MVP:
1. **Descarga y modo avión:** "Descargar para usar sin conexión" muestra "Disponible sin conexión". En modo avión, la bandeja muestra la lista guardada. Responder con "Responder yo" y guardar: aparece "Guardado en el dispositivo" y luego "Pendiente de sincronizar".
2. **Sin descarga no hay captura offline:** sin descargar, "Iniciar entrevista" queda deshabilitado.
3. **Reinicio de la app:** forzar la detención con un pendiente; sigue ahí y el borrador se puede retomar.
4. **Red intermitente y envío duplicado:** alternar el modo avión durante "Sincronizar ahora". Debe quedar un solo recibo por respuesta.
5. **Encuesta cerrada:** responder en modo avión y tocar "Simular cierre de esta encuesta (ejemplo)". Al sincronizar debe mostrar "No se pudo contar: la encuesta cerró…"; la respuesta se conserva y se descarta solo con confirmación.
6. **Entrevista incompleta:** dejar sin responder una pregunta obligatoria y tocar "Guardar respuestas". Debe aparecer el aviso; "Guardar incompleta" la guarda. En una respuesta propia, en cambio, no deja guardar.
7. **Consentimiento y grabación:** no hay micrófono antes de "La persona acepta que se grabe". Debe verse el indicador y funcionar "Detener". Con "Continuar sin grabar" no hay audio.
8. **Audio interrumpido:** una llamada o el botón Inicio detiene la grabación y conserva lo grabado. Al sincronizar aparece "Audio pendiente" y luego "Recibido".
9. **Permiso denegado:** aparece el mensaje y "Abrir configuración"; la entrevista sigue sin audio.
10. **Poco almacenamiento** (menos de 200 MB libres): el aviso aparece antes de grabar o guardar.
11. **Cambio de organización:** la otra organización no ve ni envía nada de la primera.
12. **Logout con pendientes:** aparece "Tienes encuestas sin enviar". Si se conservan y se entra con otra cuenta, no se ven ni se envían.

**B. Con la API desplegada** (`EXPO_PUBLIC_SURVEYS_SOURCE=api`). Esto sí valida el MVP:
- Repetir A1–A12 contra el servidor.
- Verificar en Admin las respuestas, `rejected_closed`, `skipped`, `consent_audio` e `interrupted`.
- Cerrar una versión archivándola o publicando una nueva mientras el teléfono está sin conexión.
- Un encuestador no asignado debe recibir el bloqueo `not_assigned_surveyor`.
- Un audio mayor que `max_bytes` debe aparecer como "Audio no aceptado".
- Abrir una encuesta desde la push requiere también desplegar `e1ce99a`.
