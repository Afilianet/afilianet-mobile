# Barra inferior y organización activa

## Dónde está la barra

**Con barra (secciones principales):** Inicio, Red, Ventas, Monedero y Perfil (pestañas), y **Encuestas** completa: la lista, una encuesta y una respuesta en curso.
- Encuestas es una sección propia, sin pestaña (se entra desde «Abrir encuestas» en Inicio o desde una notificación), con su pila: `src/app/(app)/surveys/`.
- La lista está siempre en la base de esa pila. Una encuesta abierta directamente, por ejemplo desde una notificación, vuelve con «atrás» a la lista.
- Al salir de la sección, la pila vuelve a la lista. Al volver no aparece una encuesta o respuesta antigua ni se apila otra lista.

**Sin barra, a propósito:**

| Tipo | Pantallas | Por qué |
|---|---|---|
| Captura | `compliance` (documento, prueba de vida, rostro), `assisted-enrollment`, `assisted-offline/[requestId]`, `assisted-verification/[id]`, `payout-request/[currency]` | Usan cámara o completan un trámite en pasos. Salir a mitad dejaría la captura a medias; tienen su propia salida |
| Superpuestas, con «Cerrar» | `notifications`, `notification/[id]`, `platform-notifications`, `notification-settings`, `organization-picker`, `referral`, `commissions`, `payouts`, `network-affiliate/[affiliateUuid]` | Se abren encima de una sección y vuelven a ella con «Cerrar» o «atrás». Otra barra ahí daría un segundo camino a la misma sección |
| Cuenta y decisiones irreversibles | `delete-account`, `leave-organization`, `sign-out-pending`, `privacy` | Piden una decisión o muestran texto legal, sin distracciones |
| Acceso | `(auth)/*`, `verify-account`, `join/…`, `staff-invite/[token]`, `no-organization`, `+not-found` | Antes de tener sesión u organización no hay secciones a las que ir |

**Cómo se vuelve:** el navegador raíz es una pila (`src/navigation/RootStack.tsx`, usado por `app/_layout.tsx`).
- Una pantalla sin barra se abre **encima** de la sección, que queda como estaba. «Cerrar» o «atrás» vuelven a esa misma
  sección: por ejemplo, Red → «Invitar a alguien» → «Cerrar» vuelve a Red.
- Hasta vc16 la raíz era un `Slot`: la pantalla sin barra sustituía a toda la barra, y al volver la barra se
  reconstruía en **Inicio**.
- **«Cerrar» actúa una sola vez** (`useCloseScreen`, `src/navigation/useCloseScreen.ts`). `router.back()` es global: un
  segundo toque mientras la pantalla todavía se cerraba (vc17 y vc18 en el Galaxy A06) hacía otro «atrás», y lo
  atendía la barra, que regresa por su historia (Red → Inicio). Todas las pantallas con la «X» de cerrar lo usan.
- **De una pantalla sin barra a una sección** (por ejemplo, «Abrir encuesta» en una notificación, o «Ver invitaciones»
  en la liga): se cierran las pantallas de encima y se llega a la barra que ya existe, nunca a una segunda debajo
  (`openFromOverlay`, `closeTo` en `src/navigation/rootNavigation.ts`). Dentro de las secciones se navega como siempre.
- **Redirecciones** (iniciar o cerrar sesión, organización, revisión de privacidad): empiezan de cero (`resetTo`).
  «Atrás» no puede volver a las pantallas del estado anterior, como las secciones de una sesión cerrada.

## Cambiar de sección sin perder nada

Desde una respuesta en curso, tocar otra sección de la barra ejecuta primero la **misma salida segura** que «Guardar borrador y salir» (`keepDraft`, registrada en `src/navigation/leaveGuard.ts`):
1. Si hay una grabación activa, se detiene y se sella («Finalizando grabación…»).
2. Se guarda el borrador, con las respuestas escritas hace un instante y el audio.
3. Solo entonces cambia de sección.

**Si algo falla** (la grabación no se pudo terminar, o no hay espacio), la respuesta **se queda en pantalla** con el motivo. No se navega y no se pierde nada. Otro toque lo vuelve a intentar.

Además:
- Varios toques seguidos guardan y navegan **una sola vez**.
- Durante un envío, la barra no sale.
- Un borrador en solo consulta (de otro origen) no se reescribe.
- Tras un cambio de cuenta u organización, nada se escribe en la nueva: lo pendiente se guarda en la organización del propio borrador.

**Teclado y áreas seguras:**
- La barra se oculta mientras el teclado está abierto, para que no tape lo que se escribe.
- Su altura respeta la zona de gestos o navegación del sistema.
- En tablet, las etiquetas se colocan junto a los iconos cuando hay espacio, como lo decide la barra.

## Organización activa

Un mismo recuadro, justo bajo el título, en Inicio, Red, Ventas, Monedero y la lista de Encuestas (`ActiveOrganizationBar`):
- «Organización activa» y el nombre completo, en varias líneas si es largo;
- «Cambiar», solo si hay otra organización, con la etiqueta accesible «Cambiar de organización. Activa: …», que abre el selector.

Perfil no lo lleva: ya muestra la lista completa de organizaciones.

En Inicio, Encuestas tiene su propia tarjeta («Abrir encuestas»), separada del recuadro de la organización.

## Pruebas

- `src/tests/navigation/bottom-bar.test.tsx` usa **la barra real y la pila real de Encuestas** con el router de Expo:
  - barra visible en la lista, la encuesta y la respuesta;
  - cambio inmediato sin trabajo en riesgo;
  - espera a la salida segura y navega una sola vez, aunque se toque varias veces;
  - si falla, se queda y un segundo intento puede salir;
  - al volver, solo la lista, sin pilas duplicadas;
  - una encuesta abierta directamente vuelve a la lista.
- `src/tests/navigation/bottom-bar.test.tsx`, además, con la **raíz real** (`RootStack`):
  - Red → «Invitar a alguien» abre la liga sin barra; «Cerrar» y «atrás» vuelven a Red con la barra. Con la raíz `Slot`
    de vc16, esta prueba falla: vuelve a Inicio;
  - desde el detalle de una notificación, la lista o una encuesta se abren en la misma barra, sin una segunda debajo;
  - una redirección a iniciar sesión desde una pantalla sin barra o desde Encuestas deja solo la pantalla de acceso.
- `src/tests/navigation/real-app-referral.test.tsx` usa **la app real**: layout raíz, barra, Red y la liga reales, tocando
  sus propios botones.
  - «Cerrar» vuelve a la misma Red, sin montarla de nuevo.
  - Dos toques seguidos en «Cerrar» siguen en Red. Sin `useCloseScreen` esta prueba falla: termina en Inicio.
- `src/tests/app/survey-response.test.tsx`, «switching section from the bottom bar», usa **la pantalla de respuesta real**:
  - grabación activa terminada y guardada con el borrador;
  - respuesta recién escrita guardada;
  - fallo al terminar la grabación, que se queda y explica;
  - almacenamiento lleno, que se queda y explica;
  - solo consulta;
  - no sale durante un envío;
  - cambio de organización.
- `src/tests/app/(app)/index.test.tsx`: organización activa con «Cambiar», sin «Cambiar» con una sola organización, y organización y Encuestas como elementos separados.
- **Mutaciones:** cada pieza se quitó por turno y la suite falló. Fueron siete: la guardia de la barra, el registro de la guardia, terminar la grabación, el fallo de guardado, los toques repetidos, la vuelta a la lista y la lista como base.
