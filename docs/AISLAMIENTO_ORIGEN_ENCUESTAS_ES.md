# Aislamiento por origen en encuestas (datos de ejemplo frente a API real)

**Estado:** diseño propuesto; **sin implementar** y **sin migración de almacenamiento**. Reproducción en `src/features/surveys/sourceIsolation.test.ts`.

## 1. Problema

Mobile guarda en el teléfono, por **cuenta y organización** pero **no por origen**:
- el inbox en caché;
- las versiones descargadas;
- los borradores;
- el outbox (envíos), con sus respuestas cifradas;
- los audios sellados;
- los recibos.

La fuente se elige al empaquetar (`EXPO_PUBLIC_SURVEYS_SOURCE`): de ejemplo (`fixture`) o real (`api`). El servidor de ejemplo guarda su propio estado aparte (`AsyncStorage` `afn.surveys.fixtureServer.v2`); los datos de usuario de arriba, no.

Al pasar de la fuente de ejemplo a la real con datos pendientes:

| Qué queda | Qué pasa con la fuente real | Prueba |
|---|---|---|
| Envío pendiente de ejemplo (`versionId` `fx-v-…`) | Se envía a la API real: `POST /api/v1/surveys/versions/fx-v-servicio-2/responses`. Con la API desplegada `d4cec703` responde **500** y se **reintenta indefinidamente** con espera. Con el candidato #67, **404**, y queda bloqueado como «ya no está disponible en esta organización», un motivo engañoso | `REPRODUCES` 1 y 2 |
| Borrador y descarga de ejemplo | Se siguen ofreciendo. Al enviarlos, ocurre lo mismo | `REPRODUCES` 3 |
| Audio de un envío de ejemplo | Se subiría a la API real solo si su respuesta llegara a aceptarse, lo que no ocurre con un id `fx-…`. Pero el riesgo es el mismo origen equivocado | — |
| Al volver de la API real a la de ejemplo | Lo pendiente real se ofrece al servidor de ejemplo local. Como no conoce esa versión, responde 404 y queda bloqueado como «ya no está disponible en esta organización»: un motivo engañoso. Se conserva y **no** se marca como recibido, pero ya no se reintenta solo. Si se volviera a la fuente real, seguiría bloqueado hasta que la persona lo descarte, aunque la versión real exista | `REPRODUCES` en sentido inverso |

En ambas direcciones el envío va al origen equivocado y termina con un estado o un motivo que no corresponden. Ninguna dirección marca falsamente como «Recibido» ni borra datos. Hoy solo lo evita el procedimiento manual documentado en `ENCUESTAS_MVP_ES.md`.

## 2. Propuesta

1. **Etiqueta de origen** en cada registro nuevo: `origin`. Valores posibles:
   - `"fixture"`;
   - `"api:<host>"`, con el host de `config.apiBaseUrl` (p. ej. `api:staging-api.afilianet.mx`), para distinguir también staging, producción y local.

   La etiqueta la pone la librería al escribir (`saveDraft`, `downloadVersion`, `refreshInbox`, `enqueueResponse`). El audio hereda el origen del borrador o del envío al que pertenece. El campo es **opcional**: no se reescribe nada existente.
2. **Nunca enviar al origen equivocado.** `syncOutbox(scope, source)` se salta todo envío cuyo `origin` no sea el de la fuente activa:
   - no hace petición ni cuenta un intento;
   - el envío se conserva intacto, con un estado nuevo y visible, `other_origin`: «Guardado con otra fuente de encuestas; no se envía a este servidor».

   Como defensa adicional, `apiSource` rechaza localmente cualquier `versionId` o `responseId` que no sea un UUID, antes de hacer la petición.
3. **Lectura por origen.**
   - El inbox, las descargas y la lista de encuestas usan solo el origen activo.
   - Los borradores y envíos de otro origen siguen visibles en una sección propia («Otra fuente de encuestas»), de solo lectura y con «Descartar del teléfono» explícito.
   - **Nunca se borra ni se descarta nada automáticamente.**
4. **Registros antiguos sin `origin`.** Se clasifican al leerlos, sin migrar:
   - `versionId` o `surveyId` que empiezan por `fx-` → `fixture` (los ids de ejemplo siempre lo hacen);
   - UUID → `api`, de host desconocido (decisión pendiente B);
   - cualquier otro formato → origen desconocido: no se envía y se muestra en «Otra fuente de encuestas».
5. **Recibos:** se muestran solo los del origen activo. Los antiguos sin origen siguen la regla 4 a partir de su id.
6. **Sin migración:** la etiqueta se añade al escribir, y la lectura tolera que falte. Una migración posterior que escriba `origin` en los registros antiguos sería opcional e idempotente.

## 3. Decisiones pendientes

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| A | Granularidad del origen | (a) solo `fixture`/`api`; (b) `api:<host>` | (b): evita mezclar staging y producción si alguna vez coinciden en el mismo teléfono |
| B | Registros antiguos con UUID (host desconocido) | (a) asumir el host activo; (b) ponerlos en cuarentena hasta una confirmación explícita de la persona | (a) para el APK de desarrollo actual, que siempre apuntó a staging; (b) si hubo teléfonos con builds de distintos servidores |
| C | Qué hacer con los envíos de otro origen | (a) visibles y de solo lectura, con descarte explícito; (b) ocultos hasta volver a su fuente | (a): no esconde datos y evita borrar por error |
| D | Borradores de otro origen | (a) se pueden editar pero no enviar; (b) solo lectura | (b): un borrador de ejemplo no tiene versión real a la que enviarse |
| E | Validación de UUID en `apiSource` | (a) incluirla ya, sin depender del origen; (b) solo junto con el origen | (a): defensa barata, que no requiere migración y evita el envío con ids `fx-…` |
| F | Indicador del origen activo | (a) el aviso «Vista previa» actual basta; (b) añadir también «Servidor: <host>» en «Envíos» | (b) mientras convivan ambas fuentes en pruebas |

## 4. Plan de pruebas (cuando se implemente)

- Convertir la prueba `it.failing` de `sourceIsolation.test.ts` en una prueba normal, y las `REPRODUCES` en sus inversas.
- En ambas direcciones (ejemplo → real y real → ejemplo): sin peticiones ni recibos para el origen equivocado; los datos y el audio se conservan; el estado `other_origin` es visible; el descarte solo ocurre a petición.
- Registros antiguos sin `origin` (ids `fx-…`, UUID y desconocidos) según la regla 4.
- Aislamiento por cuenta y organización intacto; compatible con el APK `versionCode` 11 (solo JavaScript).

## 5. Mitigación vigente (sin código)

El procedimiento de `ENCUESTAS_MVP_ES.md` («Antes de alternar»): sincronizar o descartar lo pendiente, descartar los borradores de ejemplo y quitar las descargas de ejemplo antes de cambiar `EXPO_PUBLIC_SURVEYS_SOURCE`. La fuente real **no está activada**.
