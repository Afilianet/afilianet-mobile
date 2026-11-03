# Guion físico corto: barra inferior y organización activa

**Candidato:** cabeza de `feat/mobile-persistent-nav`, en el worktree `.claude/worktrees/persistent-nav`. Solo JavaScript: APK `versionCode` 11.

**Fuente:** **datos de ejemplo** (sin `EXPO_PUBLIC_SURVEYS_SOURCE`), API base staging. Así ninguna respuesta sale del teléfono. **Servirlo requiere autorización de Andrés:** hoy Metro sirve #64 con la fuente real.

**Reglas:** no tocar «Descartar…», «Borrar audio», «Quitar descarga» ni «Cerrar sesión», y no abrir notificaciones.

| # | Paso | Resultado esperado |
|---|---|---|
| N1 | Inicio | Saludo y campana; debajo, el recuadro «Organización activa» con el nombre completo y, si tienes más de una, «Cambiar». **Aparte**, la tarjeta «Encuestas» con «Abrir encuestas» |
| N2 | Red, Monedero (si aparece) y «Abrir encuestas» | El mismo recuadro de organización, en el mismo lugar bajo el título. En Encuestas, la barra inferior sigue visible |
| N3 | En Encuestas, abrir «Entrevista vecinal (ejemplo)» | La barra sigue visible y usable. Tocar «Red»: cambia a Red al instante |
| N4 | «Inicio» → «Abrir encuestas» | Aparece **la lista**, no la encuesta de antes. «Atrás» de Android desde la lista lleva a Inicio, sin bucles |
| N5 | Entrevista vecinal → «Iniciar entrevista» → aceptar la grabación → «Iniciar grabación» unos 5 s → **sin detener**, tocar «Red» en la barra | «Finalizando grabación…» y luego Red. Volver con «Abrir encuestas»: el borrador muestra «Borrador»; «Continuar» → «Grabación lista · 0:05» |
| N6 | En ese borrador, escribir una respuesta de texto y tocar **enseguida** «Perfil» | Cambia a Perfil. Al volver y «Continuar», el texto está |
| N7 | Tocar «Red» tres veces seguidas desde una respuesta | Un solo cambio a Red, sin pantallas repetidas al volver |
| N8 | Con el teclado abierto en una respuesta | La barra se oculta y no tapa el campo; vuelve al cerrar el teclado |
| N9 | (Con dos organizaciones) «Cambiar» en el recuadro → elegir la otra | Inicio y Encuestas muestran la nueva. No aparecen los borradores de la otra. Volver a la original: siguen ahí |
| N10 | Tablet en horizontal y vertical | Barra completa sobre la zona de gestos; un nombre de organización largo se lee entero |

**Cubierto solo por pruebas automatizadas, no se puede provocar en la tablet:** el fallo de guardado (sin espacio), que deja la respuesta en pantalla con el motivo. Ver `docs/NAVEGACION_BARRA_INFERIOR_ES.md`.

**Al terminar:** el borrador de ejemplo de N5 y N6 se queda en el teléfono; no hace falta descartarlo.
