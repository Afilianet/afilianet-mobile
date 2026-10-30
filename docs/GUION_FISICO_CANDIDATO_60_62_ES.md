# Guion físico corto: candidato #60 + #61 + #62

**Qué se prueba:** solo lo nuevo respecto a #60, cuyo aislamiento por origen ya pasó sus tres fases (`docs/GUION_FISICO_ORIGEN_ES.md`, «Resultado de la ronda»). Esas fases **no se repiten**.
- #61: cada origen se muestra como un recuadro propio en «Guardado con otro origen».
- La campana, después de desplegar API #71 (texto de `survey_assigned`; la bandeja ya no da 500).

**Qué se usa:**
- **Candidato:** cabeza de `candidate/mobile-origin-60-61-62`, en el worktree `.claude/worktrees/candidate-60-62`.
- **APK:** `versionCode` 11. Todo es JavaScript, no hace falta un build.
- **Fuente de encuestas:** datos de ejemplo. API base: staging.

**Antes de empezar:**
- **Servir el candidato** requiere autorización de Andrés: hoy Metro sirve #60 (`c0d3db7`).
- **La parte B** requiere confirmar que API #71 (`b3175c8` en `main`) está desplegada en staging.

**Reglas:**
- No tocar «Descartar…», «Borrar audio», «Quitar descarga» ni «Cerrar sesión».
- **No abrir el detalle de ninguna notificación:** abrirla la marca como leída.

## A. Presentación de «Guardado con otro origen» (#61)

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Encuestas → bajar hasta «Guardado con otro origen» | Debajo del título, un recuadro con borde propio para cada origen. Hoy, con datos de ejemplo, solo hay uno: «Origen sin confirmar», con su explicación de una línea **dentro** del recuadro |
| A2 | Mirar el contenido del recuadro | El apartado «Recibidos (n)» con los recibos antiguos, cada uno con «Recibido» y, si lo tenía, «con audio». Nada de ese recuadro aparece fuera de él |
| A3 | Buscar botones en la sección | Ninguno: no hay enviar, continuar ni descartar. Solo habría «Consultar» si hubiera borradores de otro origen |
| A4 | Comparar el resto de Encuestas con la última ronda | Mismos borradores (incluido A, con «Continuar»), mismos envíos y recibos, y «Modo de ejemplo…» en «Envíos». La presentación no movió nada |
| A5 | Girar la tablet (si aplica) | Los recuadros se adaptan al ancho; ningún texto queda cortado |

## B. Campana después de API #71

| # | Paso | Resultado esperado |
|---|---|---|
| B1 | En la organización donde apareció el error, tocar la campana | Carga la lista. **No** aparece «Algo salió mal de nuestro lado…» ni «Intenta de nuevo» |
| B2 | Buscar la notificación de la encuesta distribuida | Título «Nueva encuesta disponible», con «Tienes una nueva encuesta por responder: «…»». El icono es la campana genérica; es lo esperado. **No abrirla** |
| B3 | Deslizar hacia abajo para actualizar | La lista se mantiene, sin error |
| B4 | (Si hay otra organización) cambiar de organización y abrir la campana | Solo se ven las notificaciones de esa organización; nada de la anterior |

Si en B1 vuelve a salir el error rojo, anotar la organización y la hora. Lo más probable es que #71 aún no esté desplegada; se puede comprobar con el registro de staging de esa hora.

**Cubierto solo por pruebas automatizadas, no se puede provocar en la tablet:**
- una respuesta 200 ilegible, que muestra «No pudimos cargar esto.» con «Intenta de nuevo» (`notifications-http.test.tsx`);
- varios orígenes a la vez en recuadros separados (`surveys-inbox.test.tsx`).

## Servir el candidato (solo con autorización de Andrés)

Mismo procedimiento que en la ronda de origen: identificar el proceso que escucha en 8082 y su worktree antes de detenerlo, y detener solo ese grupo. Después, con datos de ejemplo:

```bash
cd /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.claude/worktrees/candidate-60-62
git fetch origin candidate/mobile-origin-60-61-62 && git status -sb && git rev-parse HEAD
cp /home/andrehino/desarrollo/Afilianet/afilianet-mobile/.env.staging ./.env.staging
node ./scripts/select-env.js staging
unset EXPO_OFFLINE EXPO_PUBLIC_SURVEYS_SOURCE
npx expo start --dev-client --tunnel --clear --port 8082
```

El tunnel puede tardar si la cuenta compartida de ngrok de Expo está al límite; en ese caso, reintentar cada 5 minutos.
