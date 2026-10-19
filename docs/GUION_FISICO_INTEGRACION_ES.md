# Guion físico único: encuestas, búsqueda en «Mi red» y registro asistido

**Rama:** `integration/mobile-mvp-search-registration` (PR draft contra `main`, solo para CI y revisión; no se fusiona). El candidato es la cabeza de ese PR.

**Fuentes, sin duplicar commits:**

| Origen | SHA | Cómo entra |
|---|---|---|
| Mobile #55, búsqueda en «Mi red» | `be5a8d78be68b84ef8f66939dfb841cd8479fee9` | Base de la rama. Ya contiene Mobile #53 hasta `f09199c` (encuestas: salida sin bucle, borrador, envío definitivo, condición; audio y liveness) |
| Mobile #54, registro con teléfono o correo | `bf311431faf9a04b004f2fc440cc4089209c4d67` (un commit sobre `92fe5fd`) | `cherry-pick -x` sin conflictos. Solo coincidía en `.github/workflows/ci.yml`, y conserva los pasos de ambos |
| Integración | — | Regresión «API anterior a #63 rechaza solo teléfono», más este guion |

**APK:** `35bc0d4e-c498-40c0-b1bb-1cd11f778bcd`, `versionCode` 11, construido desde `284dd69`. Entre `284dd69` y esta rama no cambia **nada nativo** (`android`, `modules`, `plugins`, `app.json`, `app.config.js`, `eas.json`, `package.json`, `package-lock.json`). Todo llega como JavaScript por Metro, sin APK nuevo.

**API:**
- **Staging:** el SHA desplegado no está confirmado. Antes de cualquier bloque que dependa del backend, registrar el SHA y el digest desplegados.
- **API #63** (`feat/affiliate-network-name-search`, `8f7c08e`): contiene los contratos de búsqueda y de registro con teléfono o correo, pero **no está desplegada**.

**Metro:** la tablet usa hoy el Metro con tunnel del worktree `apk-dev-staging` (#53, puerto 8082), que **no** incluye la búsqueda ni el registro nuevo. Para esta ronda hay que servir esta rama (ver «Metro para esta ronda»). No se cambió todavía.

**Regla de evidencia:** un paso cuenta como probado solo si se ejecutó en la tablet. Anotar en cada paso la hora, una captura, el SHA de la rama, el `versionCode`, el SHA de la API (si aplica) y, si algo falla, el log de Metro.

**Datos:** solo sintéticos. Las encuestas usan los datos de ejemplo (aviso «Vista previa») y no se envía nada real. El registro asistido **crea afiliados en staging**: usar nombres de prueba y alias `+` del buzón del equipo, nunca personas reales. No borrar borradores ni envíos previos de la tablet.

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

## C. Solo cubierto por pruebas automatizadas (no marcar como probado en la tablet)

- **Búsqueda con HTTP simulado** (`network-search.test.tsx`): API antigua; `meta.search` distinto del pedido; respuesta tardía de un texto anterior; página posterior sin confirmación (la búsqueda pasa a no disponible, sin mezclar); cambio de organización con una petición en curso y cambio de cuenta; nunca se llama al endpoint administrativo `GET /affiliates`.
- **Encuestas** (`survey-draft-resume.test.tsx`): el recorrido completo, dos veces, con la navegación real (`Slot`) y con una pila que mantiene las pantallas montadas. La pila vuelve a Inicio con profundidad máxima 4.
- **Registro asistido** (`assisted-enrollment.test.tsx`, `assistedQueue.test.ts`): normalización (`+52…`, correo en minúsculas), mismo `client_request_id` al reintentar y aislamiento de la cola por patrocinador y organización.
- **Límite de #63:** más de 10 palabras devuelve 422. Mobile lo muestra como error de la búsqueda, nunca como resultados.

## Metro para esta ronda (no ejecutado; requiere autorización)

El Metro de la tablet (worktree `apk-dev-staging`, puerto 8082) sirve #53. Para esta ronda hay que servir esta rama: detener **ese** Metro con su propio pid (`kill -TERM -- -$(cat ~/.local/state/migracion/apk-dev-staging-tunnel.pid)`) e iniciar este en su lugar, o iniciar este en otro puerto y abrir su nueva URL en el cliente de desarrollo.

```bash
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/mvp-search-registration
git fetch origin integration/mobile-mvp-search-registration && git status -sb && git rev-parse HEAD
unset EXPO_OFFLINE EXPO_PUBLIC_SURVEYS_SOURCE
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
grep -E '^EXPO_PUBLIC_(APP_ENV|API_BASE_URL)=' .env   # staging / https://staging-api.afilianet.mx
npx expo start --dev-client --tunnel --clear --port 8083
```

La URL del tunnel cambia con cada Metro nuevo. Se obtiene con `curl -s http://127.0.0.1:4040/api/tunnels`, o en el puerto de inspección que indique ngrok si ya hay otro tunnel activo.
