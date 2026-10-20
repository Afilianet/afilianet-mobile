# Guion físico único: encuestas, búsqueda en «Mi red» y registro asistido

**Rama:** `integration/mobile-mvp-search-registration` (PR draft contra `main`, solo para CI y revisión; no se fusiona). El candidato es la cabeza de ese PR.

**Fuentes, sin duplicar commits:**

| Origen | SHA | Cómo entra |
|---|---|---|
| Mobile #55, búsqueda en «Mi red» | `be5a8d78be68b84ef8f66939dfb841cd8479fee9` | Base de la rama. Ya contiene Mobile #53 hasta `f09199c` (encuestas: salida sin bucle, borrador, envío definitivo, condición; audio y liveness) |
| Mobile #54, registro con teléfono o correo | `bf311431faf9a04b004f2fc440cc4089209c4d67` (un commit sobre `92fe5fd`) | `cherry-pick -x` sin conflictos. Solo coincidía en `.github/workflows/ci.yml`, y conserva los pasos de ambos |
| Integración | — | Regresión «API anterior a #63 rechaza solo teléfono», más este guion |
| Integración: SMS no disponible (API #63 `ad663a0`) | — | 503 `sms_unavailable` con mensaje propio y sin avanzar al código; `delivery: "queued"` sin prometer el envío; el correo se ofrece solo donde el flujo lo permite |

**APK:** `35bc0d4e-c498-40c0-b1bb-1cd11f778bcd`, `versionCode` 11, construido desde `284dd69`. Entre `284dd69` y esta rama no cambia **nada nativo** (`android`, `modules`, `plugins`, `app.json`, `app.config.js`, `eas.json`, `package.json`, `package-lock.json`). Todo llega como JavaScript por Metro, sin APK nuevo.

**SMS:** con API #63, registrar solo con celular **sí es posible** (no requiere SMS). Pero **reclamar** una cuenta asistida sin correo (recuperación por celular → código SMS → contraseña) **requiere SMS operativo**. Hoy staging no tiene SMS (sin credenciales de SNS y con la bandera apagada), así que esas cuentas no se pueden reclamar hasta que se habilite. Mientras tanto, cualquier flujo con código SMS responde «Por ahora no podemos enviar mensajes SMS…».

**API:**
- **Staging:** el SHA desplegado no está confirmado. Antes de cualquier bloque que dependa del backend, registrar el SHA y el digest desplegados.
- **API #63** (`feat/affiliate-network-name-search`, `8f7c08e`): contiene los contratos de búsqueda y de registro con teléfono o correo, pero **no está desplegada**.

**Metro:** la tablet usa el Metro con tunnel del worktree `mvp-search-registration` (#56, puerto 8082). Las correcciones de la revisión `review/mobile-mvp-journey` (PR draft aparte: D1–D3 de API #66) **no** llegan a la tablet mientras ese Metro no sirva la rama de revisión, lo que requiere autorización. Los pasos marcados «(revisión)» dependen de eso.

**Regla de evidencia:** un paso cuenta como probado solo si se ejecutó en la tablet. Anotar en cada paso la hora, una captura, el SHA de la rama, el `versionCode`, el SHA de la API (si aplica) y, si algo falla, el log de Metro.

**Datos:** solo sintéticos. Las encuestas usan los datos de ejemplo (aviso «Vista previa») y no se envía nada real. El registro asistido **crea afiliados en staging**: usar nombres de prueba y alias `+` del buzón del equipo, nunca personas reales. No borrar borradores ni envíos previos de la tablet.

**Ronda pendiente del candidato #56 + #57:** `docs/RONDA_FISICA_AUDIO_OFFLINE_ES.md` (audio, borrador con audio, sin conexión y sincronización). Esa es la ronda a ejecutar ahora; este documento conserva el inventario completo.

## Ya confirmado por Andrés en la tablet (no repetir)

- APK `versionCode` 11: conserva sesión y datos; permisos de micrófono y grabación funcionan.
- Se puede escribir texto libre y números, y guardar.
- El Metro con tunnel de #56 carga la app contra staging.

## A. Posible con el staging actual (sin API #63)

### A1. Encuestas (datos de ejemplo)

| # | Paso | Resultado esperado |
|---|---|---|
| E1 | Inicio → Encuestas → «Satisfacción con el servicio (ejemplo)» → «Abrir» | Cada pantalla tiene «Cerrar» |
| E2 | Con conexión, en una encuesta sin descargar: «Responder yo». Si ya estaba descargada, antes «Quitar descarga del teléfono», que solo aparece sin borradores | Abre sin descargar a mano; «Descargar para usar sin conexión» sigue disponible |
| E3 | Escribir un número y texto → «Guardar borrador y salir» | En «Borradores en este teléfono»: «Borrador», «Sin enviar · guardado …», «N de M respondidas» y «Continuar» |
| E4 | «Continuar» → comprobar valores → «Cerrar» (X) | Los valores siguen; vuelve a la encuesta |
| E5 | «Continuar» → completar las obligatorias → «Enviar respuesta» | Se avisa antes de que ya no se puede editar; vuelve a la encuesta, sin borrador |
| E6 | «Cerrar» → «Cerrar» | Primero la lista, con la insignia de sincronización, «Completa» y «Enviada desde este teléfono; ya no se puede editar.». Después Inicio. **Ninguna pantalla se repite** |
| E7 | Repetir E1–E6 | Los mismos dos «Cerrar» desde la encuesta hasta Inicio |
| E8 | «Entrevista vecinal (ejemplo)» → «Iniciar entrevista» → «Continuar sin grabar» → responder solo la abierta → «Enviar respuesta» | El aviso ofrece «Seguir respondiendo», «Guardar borrador y salir» y «Enviar incompleta», y dice que ya no podrá editarse |
| E9 | «Guardar borrador y salir» → «Continuar» → «Enviar respuesta» → «Enviar incompleta» → «Cerrar» | Primero queda como «Borrador» con «Continuar». Tras enviar, en «Envíos»: la insignia y, en otra línea, «Incompleta: 2 preguntas obligatorias sin responder». Sin «Continuar» |
| E10 | «Sincronizar ahora» | «Recibido», y sigue «Incompleta: …». Los recibos anteriores a este cambio no indican la condición |
| E11 | Modo avión, encuesta sin descargar → «Responder yo» | «Sin conexión, y esta encuesta no está en el teléfono…»; no abre una respuesta vacía |

### A1b. Grabación en entrevistas (APK 11, con micrófono)

**Qué decide si se pide audio:** solo las **entrevistas** (`interviewed_external`) de versiones con `audio_mode` distinto de `none` (`audioApplies` en `src/features/surveys/library.ts`). `audio_mode` lo define la versión de la encuesta en Admin: `none`, `optional` o `required`. Las respuestas propias nunca graban. «Satisfacción con el servicio (ejemplo)» es una respuesta propia con `audio_mode: "none"`, así que **no pide audio por configuración**: no es un fallo. «Entrevista vecinal (ejemplo)» tiene audio `optional`. Mobile no reproduce audio; la escucha está en Admin.

| # | Paso | Resultado esperado |
|---|---|---|
| G1 | «Entrevista vecinal» → «Iniciar entrevista» → «La persona acepta que se grabe» → «Iniciar grabación», unos 10 s → **sin detener**, «Guardar borrador y salir» | Aparece «Finalizando grabación…», los botones quedan desactivados y vuelve a la encuesta con el borrador |
| G2 | «Continuar» | Se ve «Grabación lista · 0:10» (o la duración real) y «Borrar audio». No se reactiva ninguna grabación |
| G3 | «Borrar audio» → confirmar → «Iniciar grabación» unos segundos → **sin detener**, «Cerrar» (X) | El mismo comportamiento seguro que G1: finaliza, guarda el borrador y sale |
| G4 | «Continuar» → grabar → **sin detener**, «Enviar respuesta» (dejar obligatorias sin responder) | Primero «Finalizando grabación…», después el aviso de incompleta. Con «Enviar incompleta», en «Envíos» aparece con audio y como «Incompleta» |
| G5 | En otra entrevista, grabar y pulsar «Enviar respuesta» dos veces seguidas | Un solo envío en «Envíos» |
| G6 | «Satisfacción con el servicio (ejemplo)» → «Responder yo» | No hay consentimiento ni controles de grabación (por configuración) |

### A1c. Sin conexión y recuperación, con audio (datos de ejemplo)

| # | Paso | Resultado esperado |
|---|---|---|
| O1 | Modo avión → «Entrevista vecinal» → aceptar la grabación → grabar unos segundos → responder todo → «Enviar respuesta» (sin detener) → «Cerrar» | En «Envíos»: «Guardado en el dispositivo» o «Pendiente de sincronizar», «con audio» y «Completa». Nada dice «Recibido» |
| O2 | Quitar el modo avión → «Sincronizar ahora» | Pasa a «Recibido» con «con audio». Un solo envío |
| O3 | (Opcional) Activar el modo avión justo después de que las respuestas lleguen y antes de que termine la subida del audio | Queda «Audio pendiente», nunca «Recibido», hasta que el audio sube |

### A2. Búsqueda en «Mi red» con la API actual (sin `meta.search`)

| # | Paso | Resultado esperado |
|---|---|---|
| B1 | Red → «Referidos directos» y «Colocados debajo de ti» | Cada lista tiene su propio «Buscar por nombre»; las listas se ven como antes |
| B2 | Escribir 1 letra | «Escribe al menos 2 letras para buscar.»; la lista normal sigue |
| B3 | Escribir 2 o más letras en «Referidos directos» | Tras una breve espera: «La búsqueda no está disponible con la versión actual del servidor…». **No** aparece la lista sin filtrar como resultados |
| B4 | «Limpiar búsqueda» | Vuelve la lista completa |
| B5 | Tocar una fila de la lista normal | Abre el detalle de esa persona |
| B6 | Con una búsqueda escrita, cambiar de organización (si la cuenta tiene más de una) | El campo queda vacío y no aparecen datos de la organización anterior |

### A3. Registro asistido con la API actual

| # | Paso | Resultado esperado |
|---|---|---|
| R1 | Red → «Registrar a alguien», sin correo ni celular → «Registrar» | «Escribe el correo, el celular o ambos.»; no llama a la API |
| R2 | Celular incompleto y correo mal formado | Cada error aparece en su propio campo |
| R3 | Sin confirmar la autorización | No deja registrar |
| R4 | Solo correo (alias `+`), con autorización | «Afiliado registrado · …», con las instrucciones del enlace por correo y «Su correo queda sin verificar…» |
| R5 | Solo celular (sintético) | La API actual exige correo: aparece en el campo de correo y **el formulario se conserva** (nombre, celular y autorización). No se guarda en cola ni se muestra éxito |
| R6 | Correo y celular de una cuenta ya existente | El error aparece en su campo y el formulario se conserva |

No probar «solo celular» sin conexión antes de #63: quedaría en cola y la API actual lo rechazaría al sincronizar. Si ocurre, se descarta con «Capturar o revisar INE guardada» → «Eliminar copia local».

## B. Requiere desplegar API #63 (confirmar antes el SHA desplegado en staging)

| # | Paso | Resultado esperado |
|---|---|---|
| S1 | «Referidos directos» → buscar el nombre de alguien de la red directa | Solo coincidencias de esa lista; tocar una abre su detalle |
| S2 | Buscar con y sin acentos («lopez» / «López») y dos palabras («Ana López») | Mismos resultados, en cualquier orden de palabras |
| S3 | Buscar un nombre que no está en la lista | «Nadie en esta lista coincide con «…».» |
| S4 | Buscar el nombre de alguien que solo está en «Colocados debajo de ti» desde «Referidos directos» | No aparece: las listas no se mezclan |
| S5 | Buscar el nombre de una persona de la organización que no es de tu red directa | No aparece, aunque la cuenta sea de staff |
| S6 | Buscar por código de afiliado, correo, celular o CURP | Sin resultados: solo se busca por nombre |
| S7 | Escribir rápido varias búsquedas seguidas | Solo se muestran los resultados del último texto |
| S8 | Más de 20 coincidencias (si los datos lo permiten) → «Cargar más» | Páginas siguientes de la misma búsqueda, sin repetidos |
| S9 | Cambiar de organización con una búsqueda activa | El campo se vacía; sin datos de la anterior |
| R7 | Registro solo con celular (sintético) | «Afiliado registrado · …», con «No se le envía ningún mensaje por ahora…» y los pasos para entrar con «¿Olvidaste tu contraseña?» → «Celular» |
| R8 | Registro con correo y celular | Las instrucciones explican ambas formas de entrar; los dos canales quedan sin verificar |
| R9 | Celular ya registrado | El error aparece en el campo de celular y el formulario se conserva |
| R10 | Solo celular sin conexión → recuperar la conexión → sincronizar | Queda «Guardado en este teléfono» sin decir que se envió un mensaje; se sincroniza con el mismo identificador |

### B2. SMS con API #63 (hoy sin SMS en staging: se espera el estado «no disponible»)

| # | Paso | Resultado esperado |
|---|---|---|
| M1 | Cuenta con correo y celular → Verifica tu cuenta → «Enviar código por SMS» | «Por ahora no podemos enviar mensajes SMS. Inténtalo más tarde.» y «Mientras tanto puedes seguir entrando con tu correo.». No aparece el campo del código ni la espera de reenvío |
| M2 | Cuenta solo con celular (p. ej. la de R7) → iniciar sesión con celular y contraseña → Verifica tu cuenta → «Enviar código por SMS» | El mismo aviso de SMS, **sin** mencionar el correo |
| M3 | Sin sesión: «¿Olvidaste tu contraseña?» → «Celular» → número → «Enviar código por SMS» | El aviso, más «Si tu cuenta también tiene correo, puedes recuperarla por correo. Si solo tiene celular, inténtalo más tarde.». El número se conserva y no pasa al paso del código. «Recuperar con correo» abre el formulario de correo |
| M4 | Reclamar la cuenta solo con celular de R7 | **No es posible mientras no haya SMS**: M3 no avanza. Anotarlo como bloqueado por SMS, no como fallo de la app |
| M5 | Cuando SMS esté operativo: repetir M1 y M3 | El texto dice «Pedimos el envío de un código por SMS…», nunca «enviamos». Aparece el campo del código y la espera de reenvío. Anotar si el SMS llega y cuánto tarda: «en cola» no garantiza la entrega |

El cambio de celular de una cuenta (`PATCH /me/phone`, que también responde 503 sin SMS) **no tiene pantalla en Mobile**, así que no se prueba en la tablet.

### B3. Organización activa en encuestas (API #66; requiere la API de encuestas desplegada con #66 y Mobile con `EXPO_PUBLIC_SURVEYS_SOURCE=api`) (revisión)

Hoy Mobile usa los datos de ejemplo para encuestas. Estos pasos solo aplican cuando la API real de encuestas esté desplegada con #66 y se sirva la rama de revisión.

| # | Paso | Resultado esperado |
|---|---|---|
| K1 | Con una respuesta en «Envíos» de la organización A, retirar o archivar esa versión desde Admin de A → «Sincronizar ahora» | «No se puede enviar»: «esta encuesta ya no está disponible en esta organización». Se conserva y **no** se reintenta sola; solo se borra con «Descartar del teléfono» |
| K2 | Abrir una encuesta que ya no existe en la organización activa → «Responder yo» | «Esta encuesta ya no está disponible…»; no abre ninguna respuesta |
| K3 | Cambiar de organización con envíos pendientes | Cada organización ve y envía solo los suyos |

## C. Solo cubierto por pruebas automatizadas (no marcar como probado en la tablet)

- **Búsqueda con HTTP simulado** (`network-search.test.tsx`): API antigua; `meta.search` distinto del pedido; respuesta tardía de un texto anterior; página posterior sin confirmación (la búsqueda pasa a no disponible, sin mezclar); cambio de organización con una petición en curso y cambio de cuenta; nunca se llama al endpoint administrativo `GET /affiliates`.
- **Encuestas** (`survey-draft-resume.test.tsx`): el recorrido completo, dos veces, con la navegación real (`Slot`) y con una pila que mantiene las pantallas montadas. La pila vuelve a Inicio con profundidad máxima 4.
- **Registro asistido** (`assisted-enrollment.test.tsx`, `assistedQueue.test.ts`): normalización (`+52…`, correo en minúsculas), mismo `client_request_id` al reintentar y aislamiento de la cola por patrocinador y organización.
- **Grabación** (`useInterviewRecorder.test.tsx`, `survey-response.test.tsx`): finalización lenta compartida (una sola detención y un solo sellado); fallo de sellado que conserva el archivo, no permite grabar encima y se reintenta sin volver a detener; detención fallida reintentada; doble pulsación; salida y «Cerrar» que finalizan antes de guardar; fallo sin enviar ni salir; envío incompleto con audio; audio sellado durante un autoguardado pendiente o después de salir, que sigue ligado al borrador.
- **API #66** (`outbox.test.ts`, `survey-draft-resume.test.tsx`): un 404 al enviar queda bloqueado y conservado, sin reintento; un 400 queda pendiente y llega una sola vez; un 404 del audio queda como no aceptado, sin recibo; un 404 al preparar la encuesta muestra «ya no está disponible».
- **Recorrido con el grabador real** (`survey-draft-resume.test.tsx`): grabar, guardar el borrador sin detener (detención lenta y doble pulsación), continuar, enviar una sola vez, sin conexión, fallo de subida → «Audio pendiente» → «Recibido · con audio»; y el audio rechazado nunca se da por recibido.
- **«Mi red» real** (`network.test.tsx`): cambiar de organización, con y sin caché, limpia la búsqueda y los resultados; los registros pendientes son solo los de la organización activa.
- **SMS** (`sms-availability.test.tsx`, HTTP simulado): 503 al pedir y al confirmar el código, en la verificación y en la recuperación, sin pérdida de datos; `queued` con la espera de reenvío; la alternativa de correo solo para cuentas con correo y el flujo de correo intacto.
- **Límite de #63:** más de 10 palabras devuelve 422. Mobile lo muestra como error de la búsqueda, nunca como resultados.

## Metro para esta ronda

**Hoy:** la tablet usa el Metro de #56 (worktree `mvp-search-registration`, puerto 8082, grupo de proceso en `~/.local/state/migracion/mvp-search-registration-tunnel.pid`). Sirve todo lo de las secciones A y B excepto lo marcado «(revisión)».

**Para los pasos «(revisión)»** (no ejecutado; requiere autorización): servir la rama `review/mobile-mvp-journey`. Se puede detener **ese** Metro con su propio grupo (`kill -TERM -- -$(cat ~/.local/state/migracion/mvp-search-registration-tunnel.pid)`) y arrancar el de revisión en el 8082, o arrancar el de revisión en otro puerto y abrir su nueva URL en el cliente de desarrollo.

```bash
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/mobile-review
git fetch origin review/mobile-mvp-journey && git status -sb && git rev-parse HEAD
unset EXPO_OFFLINE EXPO_PUBLIC_SURVEYS_SOURCE
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
grep -E '^EXPO_PUBLIC_(APP_ENV|API_BASE_URL)=' .env   # staging / https://staging-api.afilianet.mx
npx expo start --dev-client --tunnel --clear --port 8083
```

La URL del tunnel cambia con cada Metro nuevo. Se obtiene con `curl -s http://127.0.0.1:4040/api/tunnels`, o en el puerto de inspección que indique ngrok si ya hay otro tunnel activo. Todo sigue siendo JavaScript compatible con el APK 11; no hace falta un build nuevo.
