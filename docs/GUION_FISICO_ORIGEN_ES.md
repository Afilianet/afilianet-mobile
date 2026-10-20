# Guion físico: conservación de datos y cambio de origen en encuestas

**Qué se verifica:** al cambiar de fuente de encuestas, ningún dato se pierde y nada se envía al origen equivocado. Diseño: `docs/AISLAMIENTO_ORIGEN_ENCUESTAS_ES.md`.

**Qué se usa:**
- **Candidato:** la cabeza de `feat/survey-origin-isolation`, en el worktree `.claude/worktrees/survey-origin` (`git rev-parse HEAD`).
- **APK:** `versionCode` 11. Todo es JavaScript, no hace falta un build.
- **Tablet:** la misma de las rondas anteriores, con sus datos.

**Reglas de esta ronda:**
- **No borrar datos de la tablet:** no tocar «Descartar…», «Borrar audio», «Quitar descarga» ni «Cerrar sesión → borrar».
- **No enviar nada real:** en la fase 2 (fuente real) no abrir, descargar ni responder ninguna encuesta.
- **Cada cambio de Metro requiere autorización expresa de Andrés.** Hoy Metro sirve #56 (worktree `mvp-search-registration`, puerto 8082). Los comandos están al final.

**Evidencia por paso:** hora, captura de pantalla y, si algo falla, el número de paso.

## Fase 0: antes de cambiar nada (con el Metro actual)

| # | Paso | Anotar |
|---|---|---|
| O0 | Encuestas → capturar la pantalla completa (desplazando) | Cuántos borradores, cuántos envíos y en qué estado, y los últimos recibos. Es la referencia para comprobar que nada se pierde |

## Fase 1: este candidato con datos de ejemplo (requiere autorización: Metro, opción 1)

| # | Paso | Resultado esperado |
|---|---|---|
| O1 | Abrir Encuestas | Los mismos borradores y envíos que en O0. En «Envíos»: «Modo de ejemplo: los envíos no salen del teléfono.» |
| O2 | Bajar hasta «Guardado con otro origen» (si aparece) | Solo recibos antiguos, bajo «Origen sin confirmar»: los recibos de antes no guardaban su encuesta. Ningún borrador ni envío de ejemplo debería estar ahí. Si aparece alguno, capturarlo |
| O3 | En un borrador antiguo, «Continuar» | Editable, con sus respuestas y, si tenía, «Grabación lista · duración». «Cerrar» sin cambiar nada |
| O4 | «Entrevista vecinal (ejemplo)» → «Iniciar entrevista» → aceptar la grabación → grabar unos 5 s → «Guardar borrador y salir» | Borrador **A**, con audio («Grabación lista · 0:05» al «Continuar»). Salir con «Cerrar» |
| O5 | **Modo avión.** Nueva entrevista → aceptar → grabar unos 5 s → responder todo → «Enviar respuesta» | Envío **B** en «Envíos»: «Guardado en el dispositivo» o «Pendiente de sincronizar», «con audio». Nada dice «Recibido» |
| O6 | **Sin quitar el modo avión**, forzar la detención de la app | Así B queda pendiente durante el cambio de Metro |

## Fase 2: fuente real apuntando a staging (requiere autorización expresa: Metro, opción 2)

Esta fase activa la fuente real, solo para leer. **No abrir, descargar ni responder ninguna encuesta.**

| # | Paso | Resultado esperado |
|---|---|---|
| O7 | Quitar el modo avión, abrir la app con el nuevo bundle, ir a Encuestas | Sin el aviso «Vista previa…». En «Envíos»: «Se envían a: Afilianet (servidor de pruebas).» y «No hay envíos pendientes.» La lista de encuestas puede salir vacía o con un error si staging no tiene encuestas: no importa |
| O8 | Bajar hasta «Guardado con otro origen» | Un recuadro «Guardado con datos de ejemplo», con «No se envía a Afilianet (servidor de pruebas)…» dentro y sus apartados: «Borradores (n)» con A y los borradores antiguos («Consultar»), y «Respuestas sin enviar (n)» con B («No se envía desde aquí», «con audio»). Otro recuadro aparte, «Origen sin confirmar», con «Recibidos (n)» antiguos. No hay botones de enviar ni de descartar |
| O9 | Deslizar hacia abajo para actualizar, dos veces | B sigue igual. Nada pasa a «Recibido» ni a «No se puede enviar» |
| O10 | En A, «Consultar» | «Solo consulta: este borrador pertenece a datos de ejemplo…». Se ven las respuestas y «Grabación lista · 0:05». No se puede escribir ni elegir opciones, y no hay «Enviar respuesta», «Guardar borrador y salir» ni controles de grabación. «Cerrar» vuelve sin cambios |
| O11 | Forzar la detención y volver a abrir | Igual que O8: nada se movió |
| O12 | Modo avión 10 s, quitarlo y volver a Encuestas | Igual que O8 (reconexión sin envíos) |

## Fase 3: de vuelta a los datos de ejemplo (requiere autorización: Metro, opción 1)

| # | Paso | Resultado esperado |
|---|---|---|
| O13 | Abrir la app con el bundle de ejemplo → Encuestas | «Modo de ejemplo…». B vuelve a «Envíos» y A a «Borradores en este teléfono». En «Guardado con otro origen» quedan solo los recibos antiguos |
| O14 | Esperar o tocar «Sincronizar ahora» | B pasa a «Recibido» «con audio»: va al servidor de ejemplo, dentro del teléfono. Un solo recibo |
| O15 | A → «Continuar» | Editable otra vez, con sus respuestas y «Grabación lista · 0:05». «Cerrar» y dejarlo como borrador |
| O16 | Comparar con la captura de O0 | Todo lo de O0 sigue, más A (borrador) y B (recibido). No falta nada |

**Opcional:** con dos organizaciones, cambiar a la otra en la fase 1. No muestra ni envía nada de la primera; al volver, todo sigue ahí.

## Si algo falla

- Anotar el paso, la hora y la captura. No descartar nada para «arreglarlo».
- Si en la fase 2 algo pasa a «Recibido» o a «No se puede enviar», detener la ronda y avisar: sería un envío al origen equivocado.

## Metro (solo con autorización de Andrés)

Cada opción **reemplaza** el Metro que esté sirviendo y mantiene el puerto 8082. Los datos de la tablet se conservan: Metro solo sirve JavaScript.

```bash
# 0) Detener SOLO el Metro actual (su propio grupo de procesos)
kill -TERM -- -$(cat ~/.local/state/migracion/mvp-search-registration-tunnel.pid)

cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/survey-origin
git fetch origin feat/survey-origin-isolation && git status -sb && git rev-parse HEAD
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
grep -E '^EXPO_PUBLIC_(APP_ENV|API_BASE_URL)=' .env   # staging / https://staging-api.afilianet.mx

# Opción 1: datos de ejemplo (fases 1 y 3)
unset EXPO_OFFLINE EXPO_PUBLIC_SURVEYS_SOURCE
npx expo start --dev-client --tunnel --clear --port 8082

# Opción 2: fuente real hacia staging, solo lectura (fase 2; autorización expresa)
EXPO_PUBLIC_SURVEYS_SOURCE=api npx expo start --dev-client --tunnel --clear --port 8082
```

- La URL nueva del tunnel se lee con `curl -s http://127.0.0.1:4040/api/tunnels`.
- Se abre en el cliente de desarrollo como `exp+afilianet-mobile://expo-development-client/?url=https%3A%2F%2F<host>`.
- **Volver a servir #56 después de la ronda:** #56 es anterior a este cambio y no conoce los orígenes. Hacerlo solo si en la tablet no quedan pendientes de otro origen (ver «Riesgos que quedan» en el diseño).
