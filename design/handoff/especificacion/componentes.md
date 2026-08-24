# Especificación de componentes · Afilianet 1.0.0

Cada componente tiene una implementación de referencia en React en `codigo/componentes/`. Los valores que aparecen aquí son tokens, no literales: si un número no está en `tokens/afilianet.tokens.json`, no debe entrar al código.

Tema por defecto: **oscuro**. El tema claro solo aplica a landing, documentos y correo.

Convención de estados en toda la biblioteca:

| Estado | Regla |
|---|---|
| hover | Sube un paso de superficie o un paso de violeta. Nunca cambia tamaño. |
| active | `transform: scale(0.975)` (`movimiento.escalaPresion`), duración `instante`. |
| focus | `sombra.anilloFoco` (3px `violeta-300` al 45%). Nunca se elimina el outline sin reemplazo. |
| disabled | `opacity: 0.45`, `cursor: not-allowed`, sin hover. |
| loading | El componente conserva su caja y muestra esqueleto o spinner dentro. Nunca colapsa. |

---

## 1. Botones

`Button` — acción principal. Etiqueta: verbo + objeto, 1 a 3 palabras. Un solo botón primario por vista.

```ts
variante?: "primario" | "secundario" | "fantasma" | "peligro"
talla?: "sm" | "md" | "lg"
ancho?: boolean          // obligatorio en hojas móviles
deshabilitado?: boolean
iconoIzq?, iconoDer?: ReactNode
```

**Tallas**

| talla | alto | padding horizontal | tamaño de texto | radio |
|---|---|---|---|---|
| sm | 34px | `esp-3` (12) | `xs` (13) | `radio-sm` (8) |
| md | 42px | `esp-4` (16) | `sm` (14) | `radio-md` (12) |
| lg | 52px | `esp-5` (20) | `md` (16) | `radio-md` (12) |

Peso de la etiqueta: `semi` (600). Gap icono-texto: `esp-2` (8). Icono a 18px en md y lg, 16px en sm.

**Variantes**

| variante | fondo | texto | borde | hover | uso |
|---|---|---|---|---|---|
| primario | `accionPrimaria` | `textoSobreMarca` | — | `accionPrimariaHover` + `sombra.resplandorMarca` | la acción de la pantalla |
| secundario | `superficie1` | `texto1` | 1px `bordeSuave` | borde `bordeFuerte` | acción alterna |
| fantasma | transparente | `texto2` | — | fondo `superficie2`, texto `texto1` | acciones en tablas y filas |
| peligro | transparente | `error.base` | 1px `error.sobreOscuro` | fondo `error.sobreOscuro` | destructivo, siempre con confirmación |

En móvil, el botón primario de una hoja va a ancho completo y su alto mínimo es 48px (por encima de `medidas.toqueMinimo`).

`IconButton` — un solo icono, 40×40 (36×36 en densidad alta). `etiqueta` es obligatoria y va a `aria-label`: el icono nunca comunica solo.

---

## 2. Inputs

`Input`, `Select`, `Switch`, `Checkbox`.

```ts
// Input
etiqueta?, placeholder?, ayuda?, error?: string
tipo?: "text" | "email" | "tel" | "password" | "number"
prefijo?, sufijo?: ReactNode
mono?: boolean          // códigos de invitación, RFC, CLABE
deshabilitado?: boolean
```

**Anatomía vertical:** etiqueta (`etiqueta` rol, `texto3`) → `esp-2` → campo → `esp-2` → ayuda o error.

**Campo:** alto 44px, padding `esp-4`, radio `radio-md`, fondo `superficie1`, borde 1px `bordeSuave`, texto `sm`/`texto1`, placeholder `texto3`.

| Estado | Cambio |
|---|---|
| focus | borde `violeta-400` + `sombra.anilloFoco` |
| error | borde 2px `error.base`; el mensaje sustituye a la ayuda, nunca se suman |
| disabled | fondo `superficie1` al 50%, texto `texto3` |
| relleno mono | `familia.mono`, `tracking.normal`, para CLABE y RFC |

Reglas: la etiqueta siempre visible (no usar placeholder como etiqueta). El error describe cómo corregir, no solo qué falló: «La CLABE debe tener 18 dígitos», no «CLABE inválida».

`Switch` aplica de inmediato, sin botón de guardar. `Checkbox` se usa en listas de selección múltiple y consentimientos.

---

## 3. Cards

`Card` — contenedor base.

```ts
padding?: number      // múltiplo de 4; 20 por defecto
borde?: boolean       // true por defecto
elevada?: boolean     // hojas y popovers: añade sombra y anillo interno
```

Radio `radio-xl` (20). Fondo `superficie1`. Borde 1px `bordeSuave`. Sin sombra en tema oscuro salvo `elevada`, que suma `sombra.3` + `sombra.anilloInterno`.

Las tarjetas no se anidan más de un nivel. Dentro de una tarjeta, la separación entre bloques es `esp-4`; entre secciones, `esp-6`.

`StatCard` — cifra de panel: etiqueta (rol `etiqueta`) → valor (`2xl`, peso 800, tracking display) → delta + nota. El delta usa `exito` en positivo, `error` en negativo, `texto2` en neutro. El signo va incluido en el texto que se pasa: el componente no lo calcula.

---

## 4. Badges

`Badge` — estado, no interactivo. `Tag` — filtro, interactivo.

```ts
// Badge
tono?: "neutro" | "marca" | "exito" | "alerta" | "error"
mono?: boolean   // versalitas para niveles y metadatos: "NIVEL 2"
```

Alto 24px, padding `5px 10px`, radio `radio-pill`, texto 11px mono, `tracking` 0.06em, mayúsculas, peso 600.

| tono | fondo | texto | significado |
|---|---|---|---|
| exito | `exito.sobreOscuro` | `exito.texto` | liquidado, verificado, activo |
| alerta | `alerta.sobreOscuro` | `alerta.texto` | en proceso, pendiente, por vencer |
| error | `error.sobreOscuro` | `error.texto` | rechazado, bloqueado, revertido |
| marca | `info.sobreOscuro` | `info.texto` | campaña, programado, nivel |
| neutro | `noche-700` | `noche-300` | borrador, archivado, sin dato |

Un badge por celda. Si un registro tiene dos condiciones (suspendido y con saldo), la segunda va en el panel de detalle, no en la tabla.

`Tag` con `onClick` alterna; activo = fondo `violeta` al 18% + borde `accionPrimaria`. `onQuitar` añade una × de 16px.

---

## 5. Tabs

`Tabs` — segmentado de 2 a 4 vistas del mismo conjunto de datos.

```ts
opciones?: (string | { valor, etiqueta })[]
valor?, onChange?
ancho?: boolean
```

Contenedor: fondo `superficie2`, radio `radio-md`, padding 4px. Pestaña activa: fondo `noche-700` + `sombra.anilloInterno`, texto `texto1`, peso 600. Inactiva: texto `texto3`, sin fondo.

Para más de 4 vistas se usa `Select`. Tabs nunca navega entre secciones distintas del producto: para eso está la navegación lateral.

---

## 6. Tablas

No hay componente único: es una composición. Reglas fijas.

**Cabecera:** fondo `#181327` (`noche-900` un paso arriba), texto rol `etiqueta` en `noche-500`, alto 38px, `border-bottom` 1px `superficie2`.

**Fila:** alto 52px, padding `14px 20px`, `border-bottom` 1px `superficie2`, hover fondo `#181327`. Fila clicable: `cursor: pointer` y abre panel de detalle.

**Alineación:** texto a la izquierda; cifras, fechas y códigos a la derecha en `familia.mono`. Nunca centrado.

**Tipos de celda**
- *persona*: avatar 30px radio `radio-sm` + nombre (peso 600) + subtítulo 11px `texto3`.
- *cifra*: mono `sm`, `texto2`.
- *badge*: ver sección 4.
- *texto*: `sm`, `texto2`.

**Ancho:** `min-width` 640px con `overflow-x: auto` en el contenedor. Las tablas no comprimen columnas hasta recortarlas.

**Pie:** conteo visible sobre total en rol `etiqueta` («6 de 3,410 afiliados»). El conteo refleja el filtro activo. Se oculta cuando no hay filas.

**Árbol (tabla jerárquica):** sangría de 26px por nivel, botón −/+ de 22px al inicio de la fila, hojas con rombo de 6px en lugar de botón. Se cargan 3 hijos por rama con acción «Cargar N más»; abrir una rama muestra esqueleto mientras llega la respuesta. Nunca se renderiza el árbol completo.

---

## 7. Modals y drawers

`Sheet` (móvil) y panel de detalle (web) comparten comportamiento: fondo `rgba(12,10,20,0.62)` con `sombra.vidrio`, cierre por × y por clic en el fondo, foco atrapado dentro, `Esc` cierra.

**Hoja móvil:** ancla abajo, radio superior `radio-2xl` (24), ancho completo, tirador de 4px, entra con `dur-media` y curva `salida`. El botón primario del pie va a ancho completo.

**Drawer web:** ancla derecha, ancho 460px (`medidas.panelDetalle`), `max-width: 92vw`, borde izquierdo 1px `bordeSuave`, `sombra.4`, entra desplazándose 24px con `dur-media`.

**Anatomía del drawer de detalle:** cabecera fija (avatar 44px + tipo de registro en rol `etiqueta` + nombre `lg`/800 + identificador) → métricas en rejilla de 2 columnas → secciones de pares clave-valor separadas por 1px `superficie2` → acciones al pie.

Un modal centrado solo para confirmación destructiva: máximo 420px de ancho, dos botones, el destructivo en variante `peligro`.

---

## 8. Navegación

**Consola web.** Rail izquierdo de 268px (`medidas.railConsola`), fondo `superficie1`, borde derecho 1px `bordeSuave`. Orden: identidad de marca → conmutador de nivel → grupos de áreas → usuario al pie.

Grupos con encabezado en rol `etiqueta` (`noche-500`). Ítem: alto 38px, radio `radio-md`, rombo de 7px al inicio. Activo: fondo `#241B4A`, rombo relleno `violeta-400`, texto peso 600. Inactivo: rombo con borde 1px `noche-600`, texto `texto2`.

**Barra superior.** Alto 68px, fondo `superficie1` al 60% con `sombra.vidrio`, borde inferior 1px `superficie2`. Contiene ruta (rol `etiqueta`) + título (`xl`/800) a la izquierda; buscador, acción secundaria y acción primaria a la derecha.

**App móvil.** Barra inferior de 5 destinos máximo, alto 64px + safe area, icono 24px sobre etiqueta 11px. Destino activo en `accionPrimaria`; el resto en `texto3`. Sin badges numéricos salvo en Pagos.

---

## 9. Estados de carga, vacío y error

Cinco estados, todos obligatorios en cualquier vista que traiga datos de red.

**Loading (esqueleto).** Bloques con el radio del contenido real, en `#241B4A` sobre `superficie1`, animación `afn-pulso` de 1.2s. Se respeta la caja final para que no haya salto de layout. Spinner solo dentro de botones; nunca a pantalla completa.

**Empty (aún no hay datos).** Marca geométrica de 56px con borde discontinuo, título en `lg`/800, una oración de causa, acción primaria que crea el primer registro. Nunca un dibujo decorativo.

**No results (filtro sin coincidencias).** Distinto del anterior: se nombra el filtro que causó el vacío y la acción primaria es quitarlo, no crear nada.

**Error.** Marca en `error` sobre `error.sobreOscuro`, título que nombra qué no cargó, una oración que aclara que los datos están intactos, línea técnica en mono (`ERR-504 · hora · traza`), acciones Reintentar y Reportar a soporte.

**403 sin permiso.** Candado neutro (nunca en rojo: no es un fallo), rol `etiqueta` con «Error 403», título que nombra el rol y el área, oración que indica a quién pedir acceso y que la solicitud queda registrada en Auditoría. Acciones: Solicitar acceso, Volver.

Ninguno de los cinco estados sustituye la navegación ni la cabecera: siempre se puede salir del estado.
