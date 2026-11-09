# Aislamiento por origen en encuestas

**Estado:** implementado (rama `feat/survey-origin-isolation`, sobre Mobile #59). Solo JavaScript: compatible con el APK `versionCode` 11. Pruebas integrales en `src/features/surveys/sourceIsolation.test.ts`. Guion físico: `docs/GUION_FISICO_ORIGEN_ES.md`.

## 1. Problema que resuelve

Mobile guarda en el teléfono, por **cuenta y organización**:
- el inbox en caché;
- las versiones descargadas;
- los borradores;
- el outbox (envíos), con sus respuestas cifradas;
- los audios sellados;
- los recibos.

La fuente se elige al empaquetar (`EXPO_PUBLIC_SURVEYS_SOURCE`). Hasta Mobile #59, al cambiar de fuente o de servidor con datos pendientes, esos datos se ofrecían al origen equivocado:
- lo de ejemplo se mandaba a la API real, con ids `fx-…`;
- lo real se mandaba al servidor de ejemplo.

En ambos casos terminaban reintentándose sin fin o bloqueados con un motivo engañoso. Staging y producción tampoco se distinguían.

## 2. Qué es el origen

| Origen | Valor guardado | Cuándo |
|---|---|---|
| Datos de ejemplo | `fixture` | Fuente de ejemplo; nada sale del teléfono |
| Un servidor | `api:<esquema>://<host>[:puerto][/ruta]` | Fuente real. Ej.: `api:https://staging-api.afilianet.mx` |
| Sin confirmar | `unconfirmed` | Registro anterior a esta versión cuyo origen no se puede demostrar |

**Identidad normalizada (decisión A):** `apiOrigin(config.apiBaseUrl)` (`src/features/surveys/origin.ts`):
- pasa el esquema y el host a minúsculas;
- quita credenciales, consulta, fragmento, el punto final del host, el puerto por defecto y las barras sobrantes.

La misma URL escrita de formas distintas da la misma identidad. Staging, producción, `http` frente a `https`, otro puerto o un servidor local dan identidades distintas. Sin URL configurada, el origen `api:unconfigured` no puede enviar nada.

## 3. Reglas

1. **El origen se fija al crear el registro y no cambia.** Lo ponen:
   - `downloadVersion` y `refreshInbox`, con el origen de la fuente;
   - el detalle de la encuesta, al crear el borrador;
   - la pantalla de respuesta, al sellar el audio (el de su borrador);
   - `enqueueResponse`, con el del borrador, y el audio del envío hereda ese mismo.

   Además:
   - `saveDraft` rechaza guardar un borrador con otro origen, o con audio de otro origen;
   - `enqueueResponse` exige un origen válido y rechaza un audio de otro origen;
   - ninguna actualización del outbox puede cambiar el origen de un envío ni de su audio.
2. **Solo se envía lo del origen exacto de la fuente activa.** Todo pasa por `syncOutbox`: al abrir, al volver a primer plano, el reintento periódico, «Sincronizar ahora» y cerrar sesión con pendientes. Ahí se aplican tres controles:
   - Al empezar, se filtran las respuestas y los audios cuyo origen no es el de la fuente.
   - Justo antes de cada petición, el envío se vuelve a leer del disco y se comprueba otra vez.
   - Un audio solo se sube si su origen y el de su respuesta coinciden con la fuente. Si discrepan, no pertenece a ninguno y no se sube.

   Lo de otro origen no cuenta intentos ni cambia de estado: queda exactamente como estaba.
3. **La API real comprueba su propio servidor y los ids** (decisión E). `createApiSurveySource` guarda su origen y, en cada llamada, comprueba que el cliente HTTP sigue apuntando a ese mismo servidor. Antes de cada petición valida como UUID:
   - la versión;
   - `client_response_id`;
   - la respuesta del audio.

   Así lo exige el contrato: rutas `->whereUuid`, sin distinguir mayúsculas. Si un id no es UUID:
   - el envío queda «No se puede enviar: sus datos no tienen el formato que pide el servidor…» (`invalid_identifier`), sin petición y conservado;
   - en el audio, queda «Audio no aceptado» con su explicación.

   Si el servidor devuelve un id de sesión de audio mal formado, es un fallo suyo y se reintenta más tarde.
4. **Lectura por origen** (decisiones C y D):
   - La bandeja guardada, las descargas y los borradores editables son solo los del origen activo.
   - Cada origen guarda su propia bandeja (`inbox-<origen>`), así que actualizar la de staging no reemplaza la lista de ejemplo guardada para usar sin conexión. El archivo único de versiones anteriores (`inbox`) no se vuelve a escribir.
   - Lo demás aparece en Encuestas, en «Guardado con otro origen». Cada origen es un recuadro propio, con su encabezado y una explicación de una línea dentro, y sus registros separados en «Borradores (n)» (con «Consultar»), «Respuestas sin enviar (n)» («No se envía desde aquí») y «Recibidos (n)». Cada registro muestra su estado y si tiene audio.
   - Desde esa sección nada se envía, se edita ni se descarta. Descartar también comprueba el origen.
   - Un borrador de otro origen o sin confirmar se abre en **solo consulta**: respuestas y audio visibles, campos deshabilitados, sin grabar, guardar ni enviar.
   - «Quitar descarga» se oculta mientras cualquier borrador, de cualquier origen, use esa encuesta.
5. **Destino visible** (decisión F). «Envíos» muestra:
   - «Se envían a: Afilianet (servidor de pruebas).» para staging;
   - «Se envían a: Afilianet.» para producción;
   - «Se envían a: el servidor 192.168.1.20:8000.» para un servidor desconocido, nombrado solo por su host;
   - «Modo de ejemplo: los envíos no salen del teléfono.» con los datos de ejemplo.
6. **Se conserva lo anterior.** Esto no cambia:
   - aislamiento por cuenta y organización, y la parada si la sesión u organización cambia a mitad de una sincronización;
   - idempotencia por `client_response_id`;
   - consentimiento (`consent_audio`, `consent_version`);
   - bloqueos sin reintento automático;
   - 403 neutral salvo `reason` confirmado (API #68).

## 4. Registros anteriores (decisión B)

**Clasificación** (`legacyOrigin`):
- **Ejemplo** solo con evidencia inequívoca: el par exacto encuesta/versión de los datos de ejemplo de todo su historial (`git log` de `fixtureSource.ts`):
  - `fx-servicio`/`fx-v-servicio-2`;
  - `fx-vecinal`/`fx-v-vecinal-1`;
  - `fx-cerrada`/`fx-v-cerrada-1`.

  Una bandeja guardada es de ejemplo solo si todas sus entradas lo son.
- **«Origen sin confirmar»** todo lo demás, incluidos los UUID: **no se deduce staging ni producción por tener un UUID**. Los recibos antiguos no guardaban su versión, así que siempre quedan sin confirmar.

**Actualización** (`upgradeLegacyOrigins`, `src/features/surveys/originUpgrade.ts`; se ejecuta al cargar «Envíos»):
- Escribe **un único archivo nuevo** por cuenta y organización: el registro de clasificación `origins`, cifrado como los demás.
- **No reescribe, mueve ni borra** ningún registro, respuesta ni audio.
- **Idempotente:** solo añade entradas que faltan y nunca cambia una existente. Una segunda ejecución no escribe nada.
- **Recuperable:** si se interrumpe, o el archivo se daña, se lee como vacío y los registros se clasifican al vuelo con las mismas reglas. La siguiente ejecución lo completa.
- **Enviar no depende de que se haya ejecutado:** la clasificación al vuelo da el mismo resultado.
- **No puede volver enviable nada:** solo acepta `fixture` o `unconfirmed`. Un valor que nombre un servidor se ignora.

## 5. No se puede reetiquetar para forzar un envío

Ningún camino del código cambia el origen de un registro existente:
- `saveDraft` lo rechaza;
- `enqueueResponse` de un id ya guardado devuelve el existente sin tocarlo;
- el outbox conserva el origen en cada actualización;
- el registro de clasificación no admite servidores.

Lo prueban `sourceIsolation.test.ts` y las mutaciones descritas en la sección 7.

### Procedimiento aparte para casos «Origen sin confirmar»

No hay acción en la app para reasignarlos, a propósito. Si alguien necesita que esas respuestas lleguen al servidor:
1. **Identificar**, con la persona y su teléfono:
   - qué encuestas son, desde «Guardado con otro origen» → «Consultar»;
   - con qué build y servidor se capturaron, según el historial de builds y Metro de esas fechas.
2. **Confirmar con el equipo de encuestas en Admin** que esas respuestas no llegaron ya, buscando la encuesta, la fecha y el encuestador.
3. **Si no llegaron y deben contarse:** volver a capturarlas como respuestas nuevas, con la fuente correcta activa y la persona presente, a partir de la consulta del borrador o envío antiguo. El consentimiento de audio se vuelve a pedir; nunca se reutiliza un audio de origen sin confirmar.
4. **Conservar los antiguos** hasta que la organización decida.
   - Hoy la app no ofrece descartar registros sin confirmar fuera de «Cerrar sesión» → borrar los datos de esa cuenta y organización, que lo borra todo, con confirmación.
   - Una acción dedicada de descarte, con confirmación, es una decisión pendiente (sección 8).

## 6. Riesgos que quedan

- **Bundle anterior:** un bundle anterior a este cambio, servido por Metro con datos de varios orígenes en el teléfono, no conoce los orígenes y enviaría todo a la fuente activa. No volver a servirlo sobre un teléfono con datos mezclados.
- **Misma encuesta en dos orígenes:** las descargas se guardan por `survey_id`. Si dos orígenes compartieran el id de una encuesta, la descarga de uno reemplazaría a la del otro. Con UUID no ocurre en la práctica. Además:
  - las respuestas no dependen de la descarga;
  - un borrador cuya versión ya no está se conserva y lo explica.
- **Espacio:** lo de otro origen o sin confirmar ocupa espacio dentro del límite por cuenta y organización (300 MB) hasta que se decida qué hacer con ello.

## 7. Pruebas

Integrales (`sourceIsolation.test.ts`):
- **Montaje:** el almacenamiento real de la app (vault con llave por elemento y directorios por cuenta y organización) sobre un teléfono en memoria (`src/tests/support/fakeDevice.ts`), que conserva los datos entre reinicios de módulos.
- **Red:** cliente HTTP y fuente real contra dos servidores simulados (staging y producción), cada uno con su bucket de audio; fuente de ejemplo real.
- **Casos:**
  - ejemplo → staging y staging → ejemplo (también que la bandeja de un origen no reemplaza la del otro), incluida la antigua prueba `it.failing` («nunca se envía a la API real lo capturado con la fuente de ejemplo»), ahora una prueba normal;
  - staging ⇄ producción: cada servidor recibe solo sus respuestas y audios;
  - registros antiguos: ejemplo conocido, UUID que existe en staging y que aun así no se envía, id raro, borradores y recibos;
  - reetiquetado imposible: guardar, volver a encolar o editar el registro de clasificación;
  - borrador con audio, envío pendiente y audio parcialmente sincronizado, incluido un audio con origen discordante;
  - actualización interrumpida, repetida y con el registro dañado;
  - reconexión, reinicio, otra cuenta u organización y cambio de organización a mitad de la sincronización;
  - ids inválidos (decisión E);
  - recorrido normal en staging y con los datos de ejemplo, y 403 neutral.

**Mutaciones:** cada una se aplicó temporalmente y se comprobó que hace fallar la suite. El código quedó restaurado.

| Mutación | Pruebas que fallan |
|---|---|
| Sincronizar sin filtrar por origen | 9 |
| Quitar los dos controles de origen del audio | 2 |
| Quitar la nueva comprobación antes de cada envío (respuestas) | 1 |
| Quitar la nueva comprobación antes de cada envío (audio) | 1 |
| Registro de clasificación que acepta cualquier valor | 1 |
| Tratar un UUID antiguo como del servidor activo | 4 |
| Sin validar UUID antes de la API real | 1 |
| Permitir cambiar el origen de un borrador | 3 |
| Aceptar un envío con audio de otro origen | 2 |

Quitar solo el filtro inicial del audio no hace fallar ninguna prueba, a propósito: la nueva comprobación antes de subirlo basta por sí sola. Quitar solo esa comprobación sí hace fallar la suite (fila «Quitar la nueva comprobación antes de cada envío (audio)»).

También hay pruebas de pantalla:
- `surveys-inbox.test.tsx`: destino en «Envíos» y sección «Guardado con otro origen»: cada encabezado queda con sus propios registros, separados por tipo, y la única acción es «Consultar» un borrador;
- `survey-response.test.tsx`: solo consulta, y el audio sellado con el origen de su borrador.

Las pruebas unitarias están en `origin.test.ts` (identidad y clasificación) y `apiSource.test.ts` (ids y servidor).

## 8. Decisiones pendientes

- Acción dedicada para descartar, con confirmación, registros «Origen sin confirmar» o de otro origen, sin cerrar sesión.
- Ampliar `KNOWN_SERVERS` (`origin.ts`) si aparece otro servidor oficial, por ejemplo uno interno.
