# Guion integral: Mobile → API de staging → Admin (encuestas con audio)

**Estado:** preparado, **no ejecutado**. Ninguna escritura en staging hasta la autorización de la sección 2.

**Objetivo:** con la app real en la tablet, capturar una entrevista con audio en la organización sintética, enviarla sin conexión, reconectar y localizar esa misma respuesta en Admin, con su audio. Es el punto 1 de «Qué falta antes de usar encuestas reales desde Mobile» del runbook de infraestructura (`docs/surveys/STAGING_SURVEY_AUDIO_ROLLOUT.md`). **No** repite las tres fases de aislamiento por origen, que ya pasaron.

## 1. Punto de partida (verificado en código y evidencias, sin escrituras)

| Elemento | Valor | Fuente |
|---|---|---|
| API viva | `:46`, #71 `b3175c84` | runbook, «Estado vigente» |
| Admin | `:27`, #48 `1424a254` (encuestas y reproducción de audio) | runbook |
| Organización | `qa-e2e-survey-audio-20261020`, `03ec4b7a-0dd8-471f-a97c-902bb68a7b40`, creada con la cuenta superadmin de Andrés como **owner** | runbook, prueba sintética |
| Encuesta | `d3462bdb-2408-4105-a208-6c12c1294fdf`, versión publicada `d84bb101-252f-4313-9edf-ee5f9125156c`: solo entrevista, `audio_mode: required`, consentimiento «Consentimiento sintético QA», una pregunta de texto obligatoria | runbook y `STAGING_SURVEY_AUDIO_SYNTHETIC_E2E.md` |
| Respuesta y audio sintéticos anteriores, **que no se tocan** | respuesta `c1e93dcc-ba05-45e0-b826-3964cd3dab66` («respuesta sintética QA», capturada el 2026-10-20 hacia las 17:4xZ) y audio `04a7cd83-c66f-44bb-a531-9396658153bf` (5 s de silencio, `audio/mpeg`) | runbook |
| Audio que graba Mobile | `audio/mp4` (AAC mono, 64 kbps), dentro de los tipos por defecto de la API (`audio/mp4,audio/mpeg,audio/x-m4a`, 15 MB). El perfil `audio-storage` de staging no cambia esa lista | `config/surveys.php` @ `b3175c84`, `useInterviewRecorder.ts` |
| Procesamiento | Sin consumidor de la cola `surveys`; transcripción, calidad y retención desactivadas | runbook |

### Permisos de la cuenta de Andrés en esta encuesta

- **No tiene perfil de afiliado** en la organización QA. No se supone que lo tenga, y no hace falta.
- **Entrevista (`interviewed_external`):** la API la acepta de un encuestador asignado **o** de staff de la organización, es decir, owner, admin o manager con membresía activa, o superadmin (`SurveyResponseController::store` y `SurveyPolicy::isManagerOf` @ `b3175c84`). Andrés es **owner**, así que la API la acepta **sin** perfil, sin asignación y sin KYC.
- **Respuesta propia:** exigiría perfil de afiliado (403 `no_affiliate_profile`), pero esta encuesta no la permite.
- **Defecto de Mobile encontrado y corregido en este PR:** `GET /surveys/available` solo informa `is_assigned_surveyor`, que exige perfil de afiliado, así que para Andrés vale `false`. Mobile #63 solo ofrecía «Iniciar entrevista» con ese valor en `true`: habría mostrado «No estás autorizado como encuestador para esta encuesta», aunque la API sí acepta la entrevista. Ahora Mobile aplica la misma regla que la API: encuestador asignado **o** staff activo (`canStartInterview`). Si el rol del teléfono estuviera desactualizado, decide la API, y un 403 deja el envío conservado y bloqueado, nunca perdido.
- **Superadmin sin membresía:** Mobile no puede seleccionar una organización sin membresía, pero aquí no aplica, porque Andrés es owner.

**Sin este PR, la prueba exigiría escrituras que no hacen falta:** crear un perfil de afiliado para Andrés y asignarlo como encuestador. No se recomiendan.

## 2. Escrituras exactas que hay que autorizar

| # | Escritura | Dónde | Efecto permanente |
|---|---|---|---|
| E1 | **Servir por Metro el candidato con este arreglo**, con `EXPO_PUBLIC_SURVEYS_SOURCE=api`, API base staging y `--clear` | Esta máquina | Ninguno en staging. Los datos de ejemplo de la tablet quedan aparte, por origen |
| E2 | **Una** respuesta de entrevista nueva: `POST /api/v1/surveys/versions/d84bb101…/responses`, con `client_response_id` nuevo generado en la tablet, consentimiento `accepted` y una respuesta de texto sintética | API, organización QA | Una fila de respuesta y una de respuesta a la pregunta. **No** encola análisis de calidad, porque el consentimiento está aceptado |
| E3 | **Una** subida de audio: `POST …/responses/{nueva}/audio/uploads`, `PUT` del archivo a la URL firmada y `POST …/audio/{id}/complete` | API y bucket `afilianet-staging-survey-audio-619544672997` | **Un objeto** de unos segundos (aprox. 50–150 KB) que **queda indefinidamente** (sin permiso de borrado ni retención), un audio `uploaded`, una transcripción `pending` y **un job `TranscribeSurveyAudio` pendiente** en `survey_jobs`/`surveys`. Se procesará el día que se active un consumidor; sin proveedor, terminará `failed` |
| E4 | **Escuchar en Admin** (pide `download-url`) | API | Una auditoría `survey.audio_download_url_issued` por cada reproducción |

**No incluye:** cuentas, perfiles, invitaciones, asignaciones de encuestador, distribución, notificaciones, activar procesamiento o retención, borrados ni PERE9728. También quedan **fuera** la respuesta `c1e93dcc…` y el audio `04a7cd83…` anteriores: la tablet genera un `client_response_id` nuevo, así que la API crea una respuesta nueva y el audio solo se asocia a ella.

**Voz y privacidad.** El runbook pide decidir la privacidad antes de grabar voces reales, y el aviso de privacidad no está publicado. Propuesta: **ninguna persona habla**.
- Se reproduce con el texto a voz del PC, cerca de la tablet, la frase sintética: «Prueba sintética de Afilianet. Uno, dos, tres. Fin de la prueba.»
- No lleva nombres, lugares ni datos personales.

Si en lugar de eso Andrés lee la frase, la grabación contiene su voz y queda indefinidamente: hace falta su autorización expresa.

## 3. Antes de empezar (Andrés)

1. Confirmar que la tablet tiene la sesión iniciada con **la misma cuenta superadmin** que es owner de `qa-e2e-survey-audio-20261020`. **No** cerrar sesión para cambiarla: si es otra cuenta, detenerse y avisar.
2. En el selector de organización de Mobile, comprobar que aparece «QA E2E encuestas audio 20261020» con el rol de propietario.
3. **Elegir el marcador** de esta ronda, que se escribirá como respuesta y servirá para encontrarla en Admin: `QA-MOBILE-20261021-<HHMM>`, con la hora local de inicio. No debe contener datos personales.
4. Tener listo el texto a voz en el PC, sin reproducirlo todavía.

## 4. Recorrido

Fuente activa: **API real de staging** (E1). No abrir notificaciones, ni distribuir, asignar, descartar, borrar o cerrar sesión.

| # | Paso | Resultado esperado |
|---|---|---|
| M1 | Abrir la app con el bundle de staging → Encuestas | Sin el aviso «Vista previa…». «Envíos» dice «Se envían a: Afilianet (servidor de pruebas).» Los datos de ejemplo siguen en «Guardado con otro origen», en su recuadro y con «No se envía desde aquí» |
| M2 | Cambiar a la organización QA → Encuestas | Aparece «QA E2E audio 20261020» (o el título de la encuesta), con «Entrevista · Versión 1» |
| M3 | Abrir la encuesta | **«Iniciar entrevista»** disponible, sin «No estás autorizado…». **No** aparece «Responder yo», porque la encuesta no lo permite |
| M4 | «Descargar para usar sin conexión» | «Disponible sin conexión (descargada el …)» |
| M5 | «Iniciar entrevista» → leer el consentimiento («Consentimiento sintético QA») → «La persona acepta que se grabe» | Aparece «Iniciar grabación». El micrófono no se activa antes |
| M6 | En la pregunta, escribir el marcador del paso 3 | El texto se conserva |
| M7 | «Iniciar grabación» → reproducir la frase sintética del PC (unos 6–10 s) → «Detener grabación» | «Grabación lista · 0:0X». Anotar la duración |
| M8 | «Guardar borrador y salir» | Vuelve a la encuesta, con el borrador marcado «Borrador» |
| M9 | «Continuar» | Siguen el marcador y «Grabación lista · 0:0X» |
| M10 | **Modo avión** → «Enviar respuesta» | En «Envíos»: «Guardado en el dispositivo», «con audio» y «Completa». Nada dice «Recibido». Anotar la hora de envío: será la «capturada» de Admin |
| M11 | Quitar el modo avión → «Sincronizar ahora» (o esperar) | Pasa por «Enviando respuestas…» y «Enviando audio…», y queda **«Recibido» «con audio»**, con «Recibido el …». Anotar esa hora. Un solo recibo |

**Qué demuestra «Recibido con audio»:** Mobile solo lo marca cuando la API confirmó la respuesta (201) **y** el audio. `complete` devuelve `uploaded` solo después de que la API comprueba en el bucket que el objeto existe, con su tamaño y tipo. Si el audio fallara, el estado sería «Audio pendiente» o «Audio no aceptado», nunca «Recibido».

## 5. Localizar la misma respuesta en Admin

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Admin → organización QA → Encuestas → la encuesta → Respuestas | Al menos dos entrevistas. La **anterior** (`c1e93dcc…`, 2026-10-20) **no** es la de esta ronda |
| A2 | Identificar la nueva por **«capturada»** (la hora de M10) y **«recibida»** (la de M11) | Coinciden con lo anotado, en la zona horaria de Admin |
| A3 | Abrirla | «Entrevista», «Consentimiento de grabación: Aceptó la grabación», «Pregunta <id>: QA-MOBILE-20261021-<HHMM>» (el marcador exacto) y audio con «Duración: …» (la de M7), sin «grabación interrumpida» |
| A4 | Reproducir el audio | Se oye la frase sintética. No son 5 s de silencio: eso sería el audio anterior. Aparece el aviso de transcripción, porque está desactivada |
| A5 | Anotar el UUID de la respuesta nueva, si Admin lo muestra en la dirección o en el detalle | Sirve como referencia. Es un identificador, no un secreto. **No** copiar URLs firmadas ni tokens |

**Correlación entre Mobile y Admin, sin secretos:**
- el marcador `QA-MOBILE-20261021-<HHMM>`;
- la hora de captura y la de recepción;
- la duración del audio;
- la organización `03ec4b7a…` y la versión `d84bb101…`.

## 6. Comprobaciones opcionales de solo lectura

- **Job pendiente:** `_ops-check-staging-survey-job-pending.yml` con el UUID del **audio nuevo**. Se obtiene con una lectura autorizada de la vista de revisión, `GET /api/v1/surveys/d3462bdb…/responses/<respuesta nueva>`. Esperado: `PENDING`. No consume el job.
- **Registros de Horizon** desde M11: 0 `TranscribeSurveyAudio` procesados.

## 7. Si algo sale distinto

| Síntoma | Lectura | Qué hacer |
|---|---|---|
| M3 dice «No estás autorizado…» | El bundle no incluye este arreglo, o el rol de la tablet en la organización QA no es owner, admin o manager activo | Detenerse; comprobar el SHA servido y el rol del selector |
| M11 queda «No se puede enviar» con un motivo de autorización | La API respondió 403 | Detenerse. La respuesta y el audio quedan en la tablet. No reintentar ni descartar |
| M11 queda «Audio pendiente» | Las respuestas llegaron y el audio no | Reintentar «Sincronizar ahora» con conexión. Si persiste, anotar la hora |
| M11 queda «Audio no aceptado» | La API rechazó el tipo, el tamaño o el consentimiento | Detenerse y anotar el texto mostrado |
| En Admin no aparece la respuesta | Otra organización u otra versión | Comprobar la organización activa en Mobile y en Admin |

Al terminar, Metro vuelve a datos de ejemplo **solo con autorización**.
