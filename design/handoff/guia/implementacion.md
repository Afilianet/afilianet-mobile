# Guía de implementación · Afilianet 1.0.0

## 1. Tipografía

**Manrope** para todo el texto de interfaz. **JetBrains Mono** para cifras, códigos, fechas y etiquetas de sección.

La regla es simple: si un valor se compara con otro en una columna (montos, niveles, fechas, CLABE, affiliate code), va en mono. El texto que se lee en prosa va en Manrope.

**Pesos cargados: 400, 500, 600, 700, 800 (Manrope) y 400, 500, 700 (JetBrains Mono).** No usar 300 ni italic: la marca no tiene cursiva.

### Jerarquía

| Rol | Familia | Peso | Tamaño | Tracking | Uso |
|---|---|---|---|---|---|
| display | Manrope | 800 | 40px | −0.035em | cifra grande de panel, hero |
| título | Manrope | 800 | 26px | −0.02em | título de pantalla |
| subtítulo | Manrope | 700 | 18px | −0.02em | título de tarjeta o sección |
| cuerpo | Manrope | 400 | 14px | 0 | descripciones, prosa |
| cuerpo fuerte | Manrope | 600 | 14px | 0 | nombre en una fila, valor destacado |
| etiqueta | JetBrains Mono | 500 | 11px | 0.14em, mayúsculas | encabezado de columna, encabezado de grupo |
| cifra | JetBrains Mono | 400 | 14px | 0 | montos, conteos, fechas |

**Mínimos.** 13px en web, 12px en móvil, 11px solo para el rol etiqueta en mayúsculas. Nunca por debajo.

**Tracking negativo solo de 21px hacia arriba.** Por debajo de ese tamaño el ajuste cierra las letras y perjudica la lectura.

**Interlineado.** 1.05 para display, 1.15 para títulos, 1.5 para cuerpo, 1.65 para prosa larga (manual, correos). El ancho de lectura máximo es 68 caracteres (`medidas.anchoLectura`).

### Fuentes: pendiente por decidir

Hoy Manrope y JetBrains Mono se cargan desde Google Fonts (ver `tokens/afilianet.tokens.css`, primera línea). Recomendación para producción: **autohostear**. Se descargan los `.woff2` una vez, se sirven desde el dominio de Afilianet y se declaran con `@font-face` + `font-display: swap`. Motivos: no depender de un tercero en el arranque, no emitir una petición externa por sesión (relevante si les piden cumplimiento de privacidad) y fijar la versión del archivo. Ambas familias tienen licencia abierta (SIL OFL), así que no hay costo de licencia.

Subconjunto mínimo por archivo: latin + latin-ext (el español necesita acentos, ñ y signos de apertura).

---

## 2. Color

### Reglas de uso

**Violeta es acción, no decoración.** `violeta-500` se reserva para el botón primario, el estado activo de navegación y el progreso. Si aparece en un fondo grande deja de significar «toca aquí».

**Máximo dos superficies por pantalla.** `fondoApp` para el lienzo, `superficie1` para tarjetas. `superficie2` es solo para elementos dentro de una tarjeta (cabecera de tabla, contenedor de tabs).

**El color nunca es el único portador de significado.** Todo estado semántico lleva texto: «Liquidada», no un punto verde solo. En las tablas, el badge combina color de fondo, color de texto y palabra.

**Verde solo para dinero liberado.** `exito` (aqua) marca lo liquidado y lo verificado. No se usa como acento decorativo, para que conserve su lectura financiera.

**Ámbar es espera, rojo es acción requerida.** Si el usuario no puede hacer nada más que esperar, es `alerta`. Si tiene que intervenir, es `error`.

**Tema oscuro por defecto en el producto; claro solo en landing, documentos y correo.** Los aliases (`fondoApp`, `superficie1`, `texto1`…) cambian de valor entre temas; el código nunca escribe un hex directo.

### Contraste verificado (tema oscuro sobre `#0C0A14`)

| Par | Ratio | Cumple |
|---|---|---|
| `texto1` #ECEAF4 | 15.2:1 | AAA |
| `texto2` #A9A2C4 | 7.7:1 | AAA |
| `texto3` #857CA8 | 4.8:1 | AA (solo metadatos, nunca prosa) |
| `exito` #2DD4BF | 10.0:1 | AAA |
| `alerta` #F2B94B | 10.6:1 | AAA |
| `error` #FF6A5E | 6.7:1 | AA |
| Blanco sobre `violeta-500` | 5.1:1 | AA (no usar texto menor a 14px sobre violeta) |

`texto3` está justo por encima del mínimo AA: úsalo para subtítulos de fila, notas y encabezados de columna, nunca para párrafos.

---

## 3. Espaciado y forma

Todo el espaciado es múltiplo de 4. Los valores que se usan de verdad: 8 dentro de un control, 12 entre controles hermanos, 16 entre bloques de una tarjeta, 24 entre secciones, 40 de gutter web, 20 de gutter móvil.

Radios por tamaño de elemento: 8 para controles pequeños y avatares, 12 para botones e inputs, 16 para tarjetas de consola, 20 para tarjetas de app, 24 para hojas móviles, pill para badges y chips.

Sombras solo en superficies que flotan (hojas, drawers, popovers) y en el botón primario (`resplandorMarca`). Las tarjetas en tema oscuro se separan por borde, no por sombra.

Objetivo de toque mínimo: 44px en móvil (`medidas.toqueMinimo`). En la consola web los controles de fila pueden bajar a 34px porque el puntero es preciso.

---

## 4. Movimiento

Cuatro duraciones: 90ms para presión, 160ms para hover y cambios de color, 240ms para entrada de hojas y drawers, 400ms solo para transiciones de pantalla completa.

Curva `salida` para lo que entra, `entrada` para lo que sale, `estandar` para cambios de color. `resorte` solo en la presión de botones móviles.

Respetar `prefers-reduced-motion`: se conservan los cambios de opacidad, se eliminan los desplazamientos y escalas.

---

## 5. Ejemplo web (consola)

```
┌─ rail 268 ─┬─────────────── contenido ───────────────┐
│ marca      │ barra superior 68px                     │
│ conmutador │ ruta + título        buscar · sec · pri  │
│            ├──────────────────────────────────────────┤
│ grupos     │ descripción (máx. 78ch)                  │
│ de áreas   │ KPIs: auto-fit, minmax(200px, 1fr), gap 14│
│            │ tabla: min-width 640, overflow-x auto     │
│            │        + panel lateral 340 (opcional)     │
│ usuario    │                                           │
└────────────┴───────────────────────────────────────────┘
```

- Ancho de diseño: 1440. Punto de quiebre real: 1100px, donde el panel lateral pasa a apilarse.
- Padding del lienzo: 28px arriba, 32px a los lados (`gutterWeb` menos el rail).
- Fila de tabla clicable → drawer de 460px. Nunca navegación a otra página para ver un detalle.
- Referencia viva: `Consola web Afilianet.dc.html` en la raíz del proyecto.

## 6. Ejemplo móvil (app de afiliados)

```
┌──────────────────────────┐
│ status bar               │
│ encabezado pegajoso      │  fondo rgba(12,10,20,.72) + vidrio
│ título 26/800            │
├──────────────────────────┤
│ StatCard  │  StatCard    │  grid 1fr 1fr, gap 12
│ Card: progreso + botón   │  padding 20, radio 20
│ etiqueta de sección      │  mono 11 mayúsculas
│ Card: ListRow ×3         │  padding 4, filas de 52
├──────────────────────────┤
│ barra inferior 64 + safe │  5 destinos máximo
└──────────────────────────┘
```

- Gutter lateral: 20px. Separación entre bloques: 16px.
- Botón primario de hoja: ancho completo, alto 48px.
- Cifras siempre en mono y alineadas a la derecha de la fila.
- Referencia viva: `ui_kits/app_movil/index.html`.

---

## 7. Orden de integración sugerido

1. Cargar `tokens/afilianet.tokens.css` (o el preset de Tailwind) antes de cualquier hoja de componentes.
2. Copiar `assets/` al pipeline de estáticos. Favicon y manifest van a la raíz del dominio.
3. Implementar botones, inputs, badges y card. Con esos cuatro se arma el 70% del producto.
4. Implementar los cinco estados (carga, vacío, sin resultados, error, 403) antes de la primera pantalla con datos, no después.
5. Tabla y drawer de detalle al final: dependen de todo lo anterior.

## 8. Qué falta cerrar

- **Fuentes autohospedadas.** Decisión pendiente; hoy se cargan de Google Fonts.
- **Badges de App Store y Google Play.** Los del kit son genéricos; hay que sustituirlos por los oficiales al publicar.
- **Fotografía de catálogo.** La landing usa placeholders.
- **Iconos.** El set de `assets/iconos/` cubre las 24 acciones del producto actual. Si hace falta uno nuevo: rejilla de 24, trazo 1.75, extremos redondeados, geometría de cuadrados y rombos.
