# Auditoría y dirección visual del MVP — Afilianet Mobile

Rama: `feat/mobile-brand-visual-direction` (aislada, sin merge). No se tocó
producción: ver `src/design-system/demo/README.md` para el alcance exacto del
prototipo.

## 1. Manual, paleta y tokens — qué es oficial

**Fuente oficial encontrada en este mismo repo**: `design/handoff/` (ya
presente desde una fase anterior, "Phase 7A.2"). Jerarquía de autoridad,
tal como la declara `design/handoff/LEEME.md` y
`src/design-system/README.md`:

1. `design/handoff/tokens/afilianet.tokens.json` — fuente única de verdad
   (reflejada 1:1 en `src/design-system/tokens.ts`).
2. `design/handoff/especificacion/componentes.md` — spec escrita de
   componentes y los 5 estados.
3. `design/handoff/guia/implementacion.md` — guía de tipografía, color,
   espaciado.
4. `design/handoff/codigo/**` — JSX de referencia (solo web, no se porta).

**Repos hermanos revisados** (sin modificar ninguno): `afilianet-admin`
tiene el MISMO `design/handoff/tokens/` — confirma que es la fuente
compartida entre consola web y app, no una decisión de mobile. También se
encontró `afilianet-admin/.claude/worktrees/afilianet-admin-visual/` — un
trabajo de dirección visual ya en curso del lado admin (no se tocó, no se
leyó su contenido; se menciona solo para que el equipo lo tenga presente al
coordinar). `afilianet-docs` no contiene material de marca.

**No encontrado en ningún repo accesible**: `Manual de marca Afilianet.dc.html`
y los prototipos `ui_kits/` que `LEEME.md` referencia como viviendo "en el
proyecto, fuera de este zip" — no están en disco en ninguno de los 16 repos
hermanos revisados. Esto no bloqueó el trabajo: el propio `LEEME.md` establece
que el JSON de tokens es la autoridad máxima y que el manual solo resuelve
casos no cubiertos por él; todo lo usado aquí viene directamente del JSON/spec
escrita, nunca inventado. **Si el manual visual (`.dc.html`) existe en algún
otro lugar, pedirlo para completar la referencia narrativa — no es
bloqueante, pero sí sería útil.**

**Qué es decisión de implementación, no oficial**: `src/design-system/theme.ts`
fija `const active = themes.light` con un comentario explícito que dice que
es "a deliberate, TEMPORARY product decision" y que el valor oficial del
JSON es `oscuro`. Es decir, **el tema claro actual no es una decisión de
marca — es una desviación documentada, pendiente de revertir.**

## 2. Auditoría por pantalla

Hallazgo transversal (afecta las 5 áreas por igual, ver detalle en cada una):

> ### Hallazgo raíz: el tema está invertido respecto al manual
> `guia/implementacion.md` §2 y `especificacion/componentes.md` línea 5 dicen,
> **textualmente, dos veces**: *"Tema oscuro por defecto en el producto; claro
> solo en landing, documentos y correo."* La app usa claro en el producto
> completo.
>
> **Lo que está confirmado por cálculo (hecho, no opinión):** ver la tabla
> WCAG 2.1 completa en §5. En resumen: `colors.danger` (`#FF6A5E`),
> `colors.success` (`#2DD4BF`) y `colors.warning` (`#F2B94B`) usados como
> texto plano fallan el mínimo 4.5:1 AA sobre el fondo claro actual
> (1.78–2.81:1) y lo cumplen con margen (6.99–11.05:1) sobre el fondo oscuro
> oficial. **28 archivos** en `src/` usan estos colores como texto plano
> (`color: colors.danger`, etc.) — esto es un defecto de accesibilidad real
> y medible (la razón de contraste es matemática, no depende de gusto), y
> afecta igualmente a Home, Perfil, Login, Notificaciones y KYC. Esto
> confirma que los 24 tonos de marca fueron calibrados contra `#0C0A14`
> (coincide con la tabla de contraste que el propio manual publica en
> `implementacion.md` §2), no contra blanco.
>
> **Lo que es opinión/estética (mi lectura, no un hecho verificado):** que
> esta desviación de tema es LA causa de que el usuario perciba la app como
> "sobria" es una hipótesis razonable, respaldada por el defecto de
> contraste de arriba y por el hecho de que el violeta de marca ocupa
> ~2% de los píxeles visibles en una pantalla típica (botón primario,
> wordmark del login, activo de un badge) — pero no es algo que se pueda
> confirmar sin mostrarle al usuario la versión oscura y preguntar si
> cambia su percepción. Tratar "tema claro" como la causa confirmada de la
> queja subjetiva sería sobre-afirmar; lo que SÍ está confirmado es que el
> tema claro es una desviación documentada del manual y que produce fallos
> de contraste reales. Que corregirlo también resuelva la sensación de
> "sobria" es la recomendación de diseño en §3, no un hecho medido.

### Home (`src/app/(app)/index.tsx`)
- Jerarquía correcta (saludo → estado → verificación → finanzas → red), pero
  cada `SectionCard` es visualmente idéntica a las demás: mismo fondo, mismo
  borde, sin ícono ni acento que distinga "Afiliado" de "Monedero" de un
  vistazo — se lee por el texto de la etiqueta, no por la forma.
  `especificacion/componentes.md` no exige esto, pero tampoco lo impide;
  **es la oportunidad de color más directa, no una invención**.
- La campana de notificaciones (`NotificationBell`) no usa ícono oficial del
  set de 24 — confirmar si ya existe uno asignado o si "campana" (ya en el
  set, visto en `notifications.tsx`) debería reutilizarse aquí también.
- Botones de "ver más" (comisiones, red, monedero) son todos `variant="ghost"`
  — correcto per spec ("fantasma... acciones en tablas y filas"), pero sin
  ícono de dirección (`flechaDerecha` ya existe en el set y no se usa aquí).
- Estados de carga/vacío/error ya implementados vía `SectionCard` (skeleton,
  texto vacío, retry) — cumplen la regla "nunca colapsa la caja", pero el
  estado de error inline es solo texto+botón, sin el ícono `alerta` que sí
  usa el `ErrorState` de pantalla completa — inconsistente entre el estado
  inline y el de pantalla completa.

### Login / Registro (`src/app/(auth)/login.tsx`, `register.tsx`)
- Única pantalla donde el logotipo de marca (`Logo` violeta) aparece — bien.
- Todo lo demás (subtítulo, inputs, tres botones apilados) es monocromático:
  texto gris sobre blanco. Esto es, de hecho, **lo correcto** per el manual
  — "claro solo en... landing" podría extenderse a login por analogía, pero
  login NO es landing, es parte del producto autenticado una vez con sesión
  — **a confirmar con diseño si login cuenta como "producto" (debería ir
  oscuro) o se trata como entrada/landing (claro aceptable)**. Se marca como
  pregunta abierta, no se asume.
- Mensaje de error (`styles.error`) usa `color: colors.danger` plano — mismo
  defecto de contraste del hallazgo raíz.

### Perfil (`src/app/(app)/profile.tsx`)
- Misma estructura de tarjetas planas que Home. La tarjeta de identidad
  (avatar + nombre) es la única con `flexDirection: row` — podría ser la
  tarjeta "destacada" de la pantalla (ver Propuesta B).
- Acciones de cuenta (notificaciones, privacidad, salir de organización,
  eliminar cuenta, cerrar sesión) son 5 botones `secondary`/`ghost`
  indistinguibles entre sí — "eliminar mi cuenta" (destructivo) usa `ghost`,
  no `danger`/`peligro`; el spec define una variante `peligro` específica
  para esto exacto ("destructivo, siempre con confirmación") que no se está
  usando aquí.

### Notificaciones (`src/app/notifications.tsx`)
- Limpio y funcional; incorrectamente neutral de la misma forma que el resto.
  "Marcar todas como leídas" y el conteo de no leídas no tienen ningún
  acento — una campana con punto/badge de color (ya prototipado en la demo,
  ver abajo) ayudaría a escanear la pantalla.

### KYC / Cumplimiento (`src/app/compliance.tsx`, `ComplianceStepCard.tsx`,
y los componentes de `document-capture/`/`face-match/`)
- Ya tiene la mejor cobertura de estado semántico de toda la app (gracias a
  trabajo reciente de esta misma rama de desarrollo): `Badge` con tono
  correcto por paso, `ProcessingState` ya distingue envío/proceso/lento/error
  de conexión (ver historial de PRs recientes). **No se requiere ni se
  propone ningún cambio aquí** — es, de hecho, el área más alineada al
  manual en cuanto a disciplina de estado, solo heredando el mismo problema
  de tema general.

## 3. Dos propuestas (misma identidad aprobada, cero valores inventados)

Ambas usan exactamente `tokens.ts` — nada nuevo. Ver
`src/design-system/demo/brandDemoPalettes.ts` para la implementación exacta.

### Propuesta A — Evolución moderada
**Restaurar el tema oscuro oficial (`themes.dark`), tal cual, sin cambios
adicionales.** No es una "propuesta de diseño" en el sentido de inventar algo
— es corregir la desviación documentada en `theme.ts`. Efecto: cada color de
marca/semántico pasa a cumplir su contraste verificado oficialmente, el
violeta del botón primario y el glow (`sombra.resplandorMarca`) se leen como
fueron diseñados, y la app deja de verse "plana" simplemente porque el fondo
deja de competir con los acentos. Ningún componente cambia de estructura.

### Propuesta B — Mayor presencia de color
Mismo tema oscuro base, más tres aplicaciones adicionales — todas
reutilizando tokens ya existentes, ninguna viola "violeta es acción, no
decoración" (ninguna pinta un fondo grande de violeta):
1. **Chip de ícono por sección** (40×40, círculo) detrás del ícono de cada
   tarjeta, con el tono semántico que ya le corresponde a esa sección
   (p. ej. Monedero/Comisiones en `exito.sobreOscuro`, Verificación en
   `alerta.sobreOscuro`, Red/Afiliado en `marca.sobreOscuro`) — el mismo
   fondo translúcido que `Badge` ya usa para texto, aplicado detrás de un
   ícono en vez de solo detrás de una palabra.
2. **Una tarjeta destacada por pantalla** (la de estado de afiliado en Home,
   la de identidad en Perfil) con un lavado `marca.sobreOscuro` de fondo en
   vez de `superficie1` plano — sigue siendo una sola superficie (el lavado
   es translúcido sobre la misma superficie, no una tercera superficie, así
   que respeta "máximo dos superficies por pantalla").
3. **Barra de 4px** en el borde izquierdo de la única tarjeta con la acción
   primaria de la pantalla (continuar verificación) en `violeta-500` — esto
   es, literalmente, "violeta es acción": marca cuál tarjeta pide acción,
   nunca decora una que no la tiene.

**Recomendación razonada (opinión de diseño, apoyada en los hechos de
arriba, no un hecho en sí misma): Propuesta A primero, como su propio
cambio, seguida de Propuesta B.** Lo confirmado es que el tema invertido es
un defecto de cumplimiento de marca Y de accesibilidad verificable (§5a).
Mi lectura es que corregirlo probablemente resuelve buena parte de la queja
de "se ve sobria" — pero eso es una expectativa, no algo medido; la forma
de confirmarlo es mostrarle al usuario la versión oscura y preguntar,
no asumirlo aquí. Con el menor riesgo posible (ningún componente cambia,
solo qué paleta activa `theme.ts`), A es el paso más seguro para probar esa
hipótesis. B es una mejora genuina pero más opinativa todavía (qué tarjeta
es "destacada", qué tono le toca a cada sección) — vale la pena, pero
amerita su propia revisión de diseño por separado una vez A esté validada
en producción, no en el mismo PR.

## 4. Demostración aislada

`src/design-system/demo/` + `src/app/dev-brand-demo.tsx` (una ruta real de
Expo Router, pero que solo renderiza contenido cuando
`isDevelopmentSimulatorEnabled` es verdadero — nunca en un build de
release; ver ese README, incluida la corrección sobre por qué NO se usó una
carpeta `_dev/` como mecanismo de exclusión). Muestra Home y Perfil con
datos sintéticos, en los 3 modos (`current`/`proposalA`/`proposalB`) × 4
estados
(`Con datos`/`Cargando`/`Vacío`/`Error`), reutilizando `Icon`/`Avatar` reales
y réplicas fieles de `Card`/`Badge`/`Button`/`Skeleton` (ver ese mismo README
para por qué no se reutilizaron los componentes reales literalmente: todos
importan el `colors` global de producción, no aceptan una paleta por props).

**Capturas**: no se pudo abrir un simulador/dispositivo ni un navegador con
captura de pantalla en este entorno de ejecución (sin herramienta de
automatización de navegador disponible en esta sesión). En su lugar, se
construyó `design/visual-direction-compare.html` (también publicado como
artefacto interactivo: https://claude.ai/artifact/JeK5wsAjp7BUX2tid2SVrt) —
Actual/Propuesta A/Propuesta B lado a lado, con los mismos selectores de
pantalla (Home/Perfil) y estado (datos/cargando/vacío/error), usando los
valores hex exactos de `tokens.ts`. Es una referencia visual fiel a los
tokens reales, no un sustituto definitivo de una captura del dispositivo.
**Pendiente**: tomar las capturas reales en un simulador antes de decidir
definitivamente entre A y B.

## 5. Contraste, legibilidad, texto ampliado, controles

Esta sección separa tres clases de afirmación, a propósito, para no hacer
pasar una por otra: **(a) contraste calculado** — matemático, verificable
por cualquiera con la misma fórmula, no depende de probarlo en un
dispositivo; **(b) comprobaciones en dispositivo** — requieren un
simulador/dispositivo real y **no se realizaron en esta entrega** (ver
limitación de entorno en §4); **(c) opinión estética/de diseño** — mi
lectura, útil pero no un hecho.

### (a) Contraste — calculado, confirmado

**Calculado con la fórmula WCAG 2.1 (luminancia relativa + razón
(L1+0.05)/(L2+0.05))**, no estimado:

| Par | Fondo | Tema actual (claro) | Tema propuesto (oscuro, oficial) |
|---|---|---|---|
| texto1 | fondoApp | 19.64:1 AAA | 16.50:1 AAA |
| texto2 | fondoApp | 7.51:1 AAA | 8.09:1 AAA |
| texto2 | superficie1 | 6.75:1 AA | 7.70:1 AAA |
| `exito` como texto plano | fondoApp | **1.86:1 FALLA** | 10.55:1 AAA |
| `alerta` como texto plano | fondoApp | **1.78:1 FALLA** | 11.05:1 AAA |
| `error` como texto plano | fondoApp | **2.81:1 FALLA** | 6.99:1 AA |
| Blanco sobre `violeta-500` (botón primario) | — | 5.15:1 AA | 5.15:1 AA (no cambia) |
| Badge `exito` (texto sobre `exito.sobreOscuro`) | superficie1 | 1.54:1 FALLA (si se reutilizara así) | 7.82:1 AAA |

Esto es un hecho calculado: **el tema oscuro es el único de los dos donde
los tres colores semánticos cumplen AA como texto**, lo cual es consistente
con que fueron diseñados contra `#0C0A14`, no contra blanco. (Decir que el
tema oscuro "se ve mejor" es otra cosa — eso es opinión, ver §3; lo que
está en esta tabla es solo la razón de contraste.)

### (b) Comprobaciones en dispositivo — NO realizadas, pendientes

**Texto ampliado (Dynamic Type / "Larger Text" del SO): no se probó en un
simulador ni dispositivo real en esta entrega** (misma limitación de
entorno que las capturas, ver §4 — no hubo forma de abrir un simulador en
esta sesión). Lo único verificado es por **inspección de código**, que es
un nivel de evidencia distinto y más débil que probarlo:
`especificacion/componentes.md` fija mínimos de 13px web / 12px móvil (11px
solo para `etiqueta`), `typography.ts` ya los respeta, y no se encontró
ningún `allowFontScaling={false}` ni `fontSize` fijo no escalable en los
componentes tocados por esta demo o por las dos propuestas. Eso hace
*plausible* que el comportamiento de escalado de texto sea el mismo hoy que
en cualquiera de las dos propuestas (ninguna toca `fontSize` ni props de
escalado), pero **no se debe dar por validado** hasta confirmarlo en un
dispositivo real con "Texto más grande" / Dynamic Type activado —
especialmente en los botones y badges de la demo, donde se añadió
`minHeight` en vez de `height` fijo precisamente para no romper ese caso,
pero esa corrección en sí tampoco se ha probado en pantalla.

Tampoco se probó en dispositivo: la sensación táctil real de los 44px de
`hitSlop`, el renderizado real de los lavados/acentos semitransparentes de
la Propuesta B sobre pantallas OLED vs. LCD, ni el contraste percibido bajo
luz solar directa. Estas quedan como pendientes explícitas, no como
supuestos.

### (c) Opinión de diseño (no un hecho)

**Tamaño de controles**: por inspección de código, `Button`/`IconButton` ya
implementan 44px mínimo de toque (`medidas.toqueMinimo`, con `hitSlop` para
`sm`) y ninguna propuesta reduce el tamaño de ningún control — los chips de
ícono de la Propuesta B son 40×40 puramente decorativos (no tocables),
nunca sustituyen a un `IconButton` real. Esto es verificable leyendo el
código (no requiere dispositivo), pero que el resultado "se sienta" bien al
tocar sigue siendo, como con el texto ampliado, algo no comprobado en
dispositivo.

## Lista de tokens/componentes a cambiar para aplicar la opción elegida

Si se aprueba **Propuesta A**:
- `src/design-system/theme.ts` línea ~32: `const active = themes.light` →
  `themes.dark`. Un archivo, una línea. Actualizar el comentario que explica
  por qué está en `light` (ya no aplica).
- Auditar y corregir los **28 archivos** que usan `color: colors.danger` /
  `colors.success` / `colors.warning` como texto plano fuera de `Badge` — con
  el tema oscuro YA cumplen contraste (ver tabla), así que técnicamente no
  es bloqueante, pero vale la pena revisar cada uno para confirmar que
  ninguno asumía implícitamente el fondo claro en su layout (sombras,
  bordes).
- Revisar snapshots/tests que dependan de nombres de color si alguno los
  tiene hardcodeados (no debería, ver regla "no hex literal").
- `app.json` / splash / status bar: confirmar que el splash y la barra de
  estado del sistema combinen con el nuevo fondo oscuro (hoy configurados
  para combinar con claro).

Si además se aprueba **Propuesta B**, adicionalmente:
- Nuevo campo opcional en `ComplianceStepCard`/`SectionCard`/`StatCard`
  (o un nuevo componente `IconSectionHeader`) para el chip de ícono +
  tono — no existe hoy, habría que diseñarlo con el equipo antes de tocar
  componentes compartidos.
- Decisión de diseño pendiente: qué tono semántico corresponde a cada tipo
  de sección (Home/Perfil tienen ~6 secciones cada una) — no inventado aquí,
  la demo usa una asignación razonable pero no oficial.
- `Card` necesitaría una prop `featured`/`accentBar` (o mantenerse como
  wrapper solo en pantallas específicas) — cambio de componente compartido,
  no solo de tema.

## Qué falta (pedir, no inventar)

1. Confirmación de diseño: ¿login/registro cuentan como "producto" (oscuro)
   o como "entrada" (claro aceptable)? El manual no lo dice explícitamente.
2. El archivo `Manual de marca Afilianet.dc.html` / `ui_kits/` referenciados
   por `LEEME.md` no están en ningún repo accesible — si existen en otro
   lugar, tenerlos ayudaría a validar matices no cubiertos por el JSON
   (tono de voz visual, fotografía, etc.), aunque no bloquean esta entrega.
3. Para Propuesta B: qué tono semántico asignar a cada sección de Home/Perfil
   es una decisión de producto, no solo visual — se recomienda validarla con
   el equipo antes de construir el componente compartido.
