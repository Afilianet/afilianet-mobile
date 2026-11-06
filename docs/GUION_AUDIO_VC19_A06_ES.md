# Guion mínimo: entrevista con audio en vc19 (Galaxy A06 → staging → Admin)

**Estado: CERRADO (2026-11-06).** Andrés hizo la prueba real con vc19 en el A06: grabó, la subida terminó y el audio
se escuchó en Admin. Con esto queda validado el recorrido de consentimiento, grabación, envío, subida y reproducción.
**No valida** la transcripción ni el análisis, que siguen pendientes (siguiente etapa). Mobile no grabó, no subió y no
escribió nada en staging.

**Objetivo:** una grabación de 10 a 15 segundos con una frase ficticia, sin datos personales. Se comprueba:
1. el consentimiento;
2. el permiso del micrófono;
3. la grabación;
4. el envío automático;
5. la confirmación de la subida;
6. la reproducción desde Admin con una sesión autorizada.

Este guion reemplaza, para esta ronda, la parte de Mobile de `GUION_E2E_STAGING_ENCUESTAS_ES.md`. Ese guion usaba la
tablet y Metro, y no llegó a ejecutarse.

## 1. vc19 conserva el flujo de audio de vc18

- **Código:** vc19 (`002ccab`) solo difiere de vc18 (`f8cbf12`) en el botón «Cerrar» de 15 pantallas
  (`useCloseScreen`), una prueba y la documentación. En Encuestas cambian solo los botones «Cerrar» de la lista y del
  detalle. **No cambian** la grabadora, el consentimiento, la bóveda, el outbox ni la subida.
- **Build:** el mismo perfil `demo-apk` y la misma configuración que vc18:
  - API de staging;
  - `SURVEYS_SOURCE=api`;
  - permisos `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` en el manifiesto.
- **Entrevistas del staff:** la regla que permite entrevistar al staff de la organización (a813005) está incluida.
- **Almacenamiento:** el diagnóstico de infraestructura del bucket de audio dio `VERIFIED` (`511399f`). Lo comprobado:
  - el bucket es privado y cifra con SSE-KMS;
  - la API puede escribir y leer;
  - la API **no puede borrar** ni listar;
  - el `PUT` nativo de Android no necesita CORS.

## 2. Organización, encuesta y permisos

| Elemento | Valor |
|---|---|
| Organización | **QA E2E encuestas audio 20261020** (`qa-e2e-survey-audio-20261020`, `03ec4b7a-0dd8-471f-a97c-902bb68a7b40`). Es sintética: no es la organización de la demo |
| Encuesta | `d3462bdb-2408-4105-a208-6c12c1294fdf`, versión publicada `d84bb101-252f-4313-9edf-ee5f9125156c`. Solo admite entrevista, con audio **obligatorio**, consentimiento «Consentimiento sintético QA» y una pregunta de texto obligatoria |
| Cuenta en el A06 | La cuenta superadmin de Andrés, que es **owner** de esa organización |
| Qué permite el owner | La API acepta una entrevista de un encuestador asignado **o** de staff activo (owner, admin o manager) (`SurveyResponseController::store` y `SurveyPolicy::isManagerOf` @ `904db37`). Mobile aplica la misma regla. **No necesita** perfil de afiliado, asignación de encuestador ni KYC |
| Caso KYC | No se toca. La entrevista no pide verificación ni documentos |
| Admin | Sesión de esa misma cuenta, u otra que sea owner, admin o manager de la organización QA |

### Lo que hay que confirmar antes, sin cambiar nada

1. **La cuenta del A06.** Si el A06 tiene sesión con otra cuenta, como `+demo1` o la del afiliado de la demo, esa cuenta
   no es staff de la organización QA y verá «No estás autorizado como encuestador para esta encuesta». En ese caso, ver
   la sección 3. No cierres sesión desde la app para cambiar de cuenta sin decidirlo antes.
2. **La encuesta sigue publicada y abierta.** En Admin → organización QA → Encuestas, solo lectura. Mobile no la puede
   consultar por su cuenta: la API de staging solo se lee con la sesión de la persona.
3. **La organización QA aparece en el selector de Mobile** con el rol de propietario.

Si las tres se cumplen, **no falta ninguna configuración ni asignación.**

## 3. Si algo falta: opciones que se presentan, no se aplican

| Situación | Cambio necesario (escritura en staging) | Recomendación |
|---|---|---|
| El A06 tiene otra cuenta | A: iniciar sesión en el A06 con la cuenta superadmin owner. Requiere cerrar la sesión actual, que es decisión tuya. B: dar a la cuenta del A06 el rol de manager en la organización QA. C: crearle un perfil de afiliado ahí y asignarla como encuestadora. La asignación es por organización, no por encuesta | **A**. B y C escriben membresías o perfiles solo para una prueba |
| La encuesta está cerrada o no tiene audio | Publicar en la organización QA una versión con entrevista y `audio_mode: required` u `optional`. Es una escritura de Admin | Solo si el punto 2 falla |
| Usar la organización de la demo en lugar de la QA | Crear y publicar ahí una encuesta con entrevista y audio, y además dar rol de staff o una asignación | **No.** Mezcla una respuesta con audio de prueba con los datos de la demo |

## 4. Pasos en el A06

Antes de empezar:
- Wi-Fi o datos activos.
- Tener lista una frase ficticia, por ejemplo: «Prueba de audio número uno, el cielo es verde y los martes llueve
  chocolate».

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Organización activa → QA E2E encuestas audio 20261020 → Encuestas | Aparece la encuesta con «Entrevista» |
| A2 | Abrir la encuesta → «Iniciar entrevista» | Formulario. La «Referencia de la persona entrevistada» es opcional: **dejarla vacía** |
| A3 | Tarjeta «Consentimiento para grabar» | Muestra el texto de la versión («Consentimiento sintético QA») y la nota de que el micrófono solo se activa después. **Todavía no pide el micrófono** |
| A4 | «La persona acepta que se grabe» | Aparece «Iniciar grabación» |
| A5 | «Iniciar grabación» | **La primera vez**, Android pide el micrófono. Permitir «Mientras la app está en uso». Empieza «● Grabando · 0:00» |
| A6 | Leer la frase durante 10 a 15 segundos → «Detener grabación» | «Grabación lista · 0:1x» |
| A7 | Pregunta de texto: escribir la misma frase ficticia → «Enviar respuesta» | Se guarda y **se envía sola**, sin «Sincronizar ahora» |
| A8 | Encuestas → «Envíos» | Pasa de «Audio pendiente» a **«Recibido el {fecha} · con audio»**, con la nota «La transcripción y el análisis del audio se hacen en el servidor…». Esa es la confirmación de la subida: la API comprobó que el objeto existe y que su tamaño coincide |
| A9 | Opcional: Ajustes → Apps → Afilianet → Permisos | Micrófono «Permitido solo mientras se usa la app» |

Si A8 se queda en «Audio pendiente» más de unos minutos con red, **no reintentes ni grabes de nuevo.** Anota la hora y
avisa. El outbox reintenta sin duplicar, y el diagnóstico se hace por lectura.

## 5. Reproducción en Admin

| # | Paso | Resultado esperado |
|---|---|---|
| B1 | Admin (staging), con sesión de owner, admin o manager de la organización QA → Encuestas → la encuesta → Respuestas | Una entrevista nueva con la hora de A7, además de las anteriores del 2026-10-20 |
| B2 | Abrir esa respuesta | Texto ficticio, consentimiento aceptado y un audio de unos 10 a 15 s |
| B3 | Reproducir | Se oye la frase. Cada reproducción pide una URL temporal de 5 minutos y deja una auditoría `survey.audio_download_url_issued` |
| B4 | Ver el estado de la transcripción, si Admin lo muestra | `pending`, y es lo esperado (ver la sección 6) |

## 6. Qué queda en staging y qué no se activa

Cada prueba completa crea:
- 1 respuesta;
- 1 objeto de audio de unos 100 KB en el bucket `afilianet-staging-survey-audio-619544672997`;
- 1 fila de audio `uploaded`;
- 1 transcripción `pending`;
- las auditorías de las reproducciones.

- **El archivo permanece almacenado mientras no exista una política de eliminación.**
  - La API registra `retention_until` a un año, pero nada lo aplica: la retención programada solo corre con
    `PRIVACY_RETENTION_SCHEDULE_ENABLED`, que en staging vale `false`.
  - Además, el rol de la API **no puede borrar** objetos del bucket (verificado en el diagnóstico).
  - Hoy no hay forma de quitarlo desde la app ni desde Admin.
- **Transcripción:** al confirmar la subida, la API encola un job `TranscribeSurveyAudio` en la cola `survey_jobs` /
  `surveys` (configuración de Terraform de staging). **Nadie la consume:** Horizon solo atiende `default`, y no hay
  proveedor. El job queda pendiente. Esto no activa nada, y no hay que activar ningún consumidor.
- **Análisis de calidad:** `SURVEYS_QUALITY_ANALYSIS_ENABLED` está apagado en staging (`not_scheduled`). No se encola.
- **Mobile no muestra** ni la transcripción ni el análisis.

**No se hace en esta ronda:**
- activar la transcripción, el análisis, consumidores, workers ni la retención;
- borrar objetos o respuestas;
- tocar el caso KYC o subir documentos;
- usar la organización de la demo;
- reenviar ni hacer grabaciones extra para diagnosticar.
