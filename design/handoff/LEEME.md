# Handoff de desarrollo · Afilianet

Versión 1.0.0 · 20 de agosto de 2026

Todo lo necesario para construir la app móvil y la consola web sin volver a abrir un archivo de diseño.

## Contenido

    tokens/
      afilianet.tokens.json      fuente única de verdad
      afilianet.tokens.css       las mismas variables como CSS custom properties
      afilianet.tokens.scss      variables SCSS generadas
      afilianet.preset.js        preset de Tailwind que lee el JSON

    assets/
      logo/          logotipo horizontal e isotipo, en violeta, tinta y blanco (SVG)
      iconos/        24 iconos propios (SVG, 24×24, trazo 1.75) + sprite
      favicon/       16, 32, 48, 180, 192, 512 + favicon.svg + site.webmanifest
      app-icon/      1024 plano y redondeado, adaptativo Android, Play Store 512
      splash/        iOS 1242×2688 y 1125×2436, Android 1440×2560, web 1920×1080
      patrones/      malla de marca (fondo)

    especificacion/
      componentes.md   botones, inputs, cards, badges, tabs, tablas, modals/drawers,
                       navegación y los cinco estados

    guia/
      implementacion.md  tipografía, pesos, jerarquías, tamaños, reglas de color,
                         ejemplos mobile y web, orden de integración

    codigo/
      componentes/     18 componentes React de referencia (.jsx + .d.ts + notas)
      primitivas.jsx   bundle que usan los prototipos

## Cómo empezar

1. `tokens/afilianet.tokens.json` es la fuente de verdad. Los otros tres archivos de tokens se derivan de él; si cambia un valor, se regeneran.
2. Carga `afilianet.tokens.css` antes de cualquier hoja de componentes. Ningún componente debe contener un hex literal.
3. Lee `guia/implementacion.md` completo antes de la primera pantalla: define tipografía, color y las dos retículas (móvil y web).
4. `especificacion/componentes.md` tiene las medidas por estado de cada componente.

## Prototipos de referencia (en el proyecto, fuera de este zip)

| Archivo | Qué muestra |
|---|---|
| `Consola web Afilianet.dc.html` | 18 áreas, dos niveles, árbol de red, drawers, cinco estados |
| `ui_kits/app_movil/index.html` | app de afiliados, recorrido completo |
| `ui_kits/sitio_web/index.html` | landing |
| `Manual de marca Afilianet.dc.html` | manual de marca, 10 secciones |

## Decisiones abiertas

- **Fuentes.** Manrope y JetBrains Mono se cargan hoy desde Google Fonts. Recomendación: autohostear los `.woff2`. Licencia SIL OFL, sin costo.
- **Badges de tienda.** Los del kit son genéricos; hay que usar los oficiales de Apple y Google al publicar.
- **Fotografía.** La landing usa placeholders hasta tener catálogo real.

## Contacto de diseño

Cualquier duda sobre un token o una medida: revisar primero el manual de marca y esta especificación. Si el caso no está cubierto, no improvisar valores nuevos — pedirlos.
