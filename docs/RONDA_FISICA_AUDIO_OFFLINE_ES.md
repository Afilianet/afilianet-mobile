# Ronda física: audio, borrador con audio, sin conexión y sincronización

**Candidato:** la cabeza de la rama `candidate/mobile-mvp-56-57`, que combina Mobile #56 y #57 sin reescribir historia (`git rev-parse HEAD` en el worktree `mvp-candidate`). **APK:** `versionCode` 11 (`35bc0d4e`); todo es JavaScript, no hace falta un build. **Metro:** hay que servir este candidato (requiere autorización; ver «Servir el candidato» al final).

**Fuente de encuestas:** los datos de ejemplo (aviso «Vista previa…»). No se envía ni se sube nada real: la sincronización va a un servidor de ejemplo dentro del teléfono.

**No repetir (ya confirmado por Andrés):**
- sesión y datos conservados con el APK 11;
- permisos de micrófono;
- que la grabación funciona;
- escribir texto y números;
- que la app carga por Metro.

**Evidencia por paso:** hora, captura o grabación de pantalla y, si algo falla, el número de paso y si la pantalla se repitió o se quedó esperando.

| # | Paso | Resultado esperado |
|---|---|---|
| R1 | Encuestas → «Entrevista vecinal (ejemplo)» → «Iniciar entrevista» → «La persona acepta que se grabe» → «Iniciar grabación», unos 10 s → **sin detener**, «Guardar borrador y salir» | «Finalizando grabación…» y botones desactivados. Vuelve a la encuesta, con el borrador marcado «Borrador» |
| R2 | «Continuar» | «Grabación lista · 0:10» (o la duración real), con «Borrar audio». Las respuestas escritas siguen ahí. No hay ninguna grabación activa |
| R3 | «Borrar audio» → confirmar → «Iniciar grabación» unos 5 s → **sin detener**, «Cerrar» (X) | El mismo comportamiento que R1. Al «Continuar», «Grabación lista · 0:05» |
| R4 | Grabar unos segundos → **sin detener**, el gesto o botón «atrás» de Android | Al volver con «Continuar», el borrador conserva el audio («Grabación lista») |
| R5 | Modo avión. «Continuar» → responder todas las preguntas → **dos toques rápidos** en «Enviar respuesta» → «Cerrar» | En «Envíos», **una sola** respuesta: «Guardado en el dispositivo» o «Pendiente de sincronizar», más «con audio» y «Completa». Nada dice «Recibido». El borrador ya no aparece |
| R6 | Sigue en modo avión. Nueva entrevista → aceptar → grabar → **sin detener**, «Enviar respuesta» dejando obligatorias sin responder | Primero «Finalizando grabación…», luego el aviso: «Seguir respondiendo», «Guardar borrador y salir» o «Enviar incompleta». Con «Enviar incompleta», en «Envíos»: «con audio» e «Incompleta: N preguntas obligatorias sin responder» |
| R7 | Quitar el modo avión → «Sincronizar ahora» | Cada envío pasa a «Recibido» con «con audio» y conserva «Completa» o «Incompleta…». Hay tantos recibos como envíos, ninguno duplicado |
| R8 | (Opcional) Activar el modo avión justo cuando aparece «Enviando audio…» | Queda «Audio pendiente», nunca «Recibido», hasta reintentar con conexión |

**Fuera de esta ronda:**
- Los 404 y 403 de la API real (bloqueado «ya no está disponible en esta organización», «ya no estás asignado como encuestador», audio no aceptado) solo se pueden probar con la API real de encuestas desplegada y `EXPO_PUBLIC_SURVEYS_SOURCE=api`, que no se activa. Están cubiertos por pruebas automatizadas (`outbox.test.ts`, `survey-draft-resume.test.tsx`).
- La espera entre reintentos ante un error persistente (5 s, que se duplica hasta 10 min, sin duplicar) también está cubierta en `outbox.test.ts`.

## Servir el candidato (cuando Andrés lo autorice)

El Metro de la tablet sirve hoy #56 (worktree `mvp-search-registration`, puerto 8082). El candidato añade #57 y estas correcciones. Opción A, que **reemplaza** el Metro actual y mantiene el puerto:

```bash
# 1) Detener SOLO el Metro de #56 (su propio grupo de procesos)
kill -TERM -- -$(cat ~/.local/state/migracion/mvp-search-registration-tunnel.pid)
# 2) Servir el candidato
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/mvp-candidate
git fetch origin candidate/mobile-mvp-56-57 && git status -sb && git rev-parse HEAD
unset EXPO_OFFLINE EXPO_PUBLIC_SURVEYS_SOURCE      # datos de ejemplo
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
grep -E '^EXPO_PUBLIC_(APP_ENV|API_BASE_URL)=' .env   # staging / https://staging-api.afilianet.mx
npx expo start --dev-client --tunnel --clear --port 8082
```

La URL nueva del tunnel se lee con `curl -s http://127.0.0.1:4040/api/tunnels` y se abre en el cliente de desarrollo como `exp+afilianet-mobile://expo-development-client/?url=https%3A%2F%2F<host>`. Los datos locales de la tablet se conservan: Metro solo sirve JavaScript.
