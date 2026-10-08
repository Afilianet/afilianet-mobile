# Brand visual-direction demo (isolated, not production)

This folder exists to let the team compare two visual-direction proposals for
Afilianet Mobile side by side, using the **official, already-approved** brand
tokens — no invented colors — before deciding whether to apply either one to
the real app. See `design/BRAND_VISUAL_AUDIT.md` (repo root `design/`
folder) for the full audit, the two proposals' reasoning, and the
token/component change list for whichever one is chosen.

## Where it lives, and why it's safe

- `brandDemoPalettes.ts` / `DemoPrimitives.tsx` / `BrandDirectionDemo.tsx` —
  plain modules under `src/design-system/demo/`. Nothing in `src/app/`
  (routes) or any production screen imports them, so they ship zero bytes
  of behavior change to the real app.
- `src/app/dev-brand-demo.tsx` — the only route-adjacent file, and it is a
  **real, navigable Expo Router route** (`/dev-brand-demo`) — see "How this
  is kept out of a release build" below for why that's still safe. No
  navigation, API, permissions, or business-logic code was touched beyond
  this one additive file.
- `Icon` and `Avatar` are the real, unmodified components (both already
  take color/tone as explicit props). `Card`/`Badge`/`Button`/`Skeleton`
  have demo-local, visually-faithful counterparts in `DemoPrimitives.tsx`
  instead of the real ones, because the real ones import the single global
  `colors` object from `src/components/ui/theme.ts` and bake its values
  into module-level constants at import time — there is no way to render
  three palettes side-by-side through them without either mutating that
  shared, production-wide singleton (unsafe: any other mounted screen
  reading the same module would see it change) or restructuring them to
  accept a theme prop (a real change to production components, out of
  scope for an isolated demo). The demo-local versions use the exact same
  spacing/radius/typography/motion **tokens** (imported directly from the
  real `theme.ts` — those values don't change between light/dark) and the
  same component spec (`design/handoff/especificacion/componentes.md`),
  just parameterized by an explicit `palette` prop.

### A correction from this branch's first pass

The first version of this demo placed its route at `src/app/_dev/brand-demo.tsx`
and claimed Expo Router ignores underscore-prefixed paths. **That was
wrong, and has been corrected.** Verified directly against this project's
installed `expo-router` (57.0.15) rather than assumed:

```
node -e "
const path = require('path');
const requireContext = require('expo-router/build/testing-library/require-context-ponyfill').default;
const ctx = requireContext(path.resolve('src/app'), true, /\.[tj]sx?\$/);
console.log(ctx.keys().filter(k => k.includes('_dev')));
"
# -> [ './_dev/brand-demo.tsx' ] -- it WAS in the raw file scan.
```

Both the file-scanning step (`expo-router/build/testing-library/require-context-ponyfill.js`,
the same context-building logic Metro's `require.context` uses) and the
route-generation ignore list (`expo-router/build/getRoutesCore.js`) only
special-case `_layout`, `+html`, `+not-found`, `+api`, and `+middleware` —
there is no underscore-prefix exclusion in this version. A file under
`_dev/` would have become a real, navigable route. It has been removed and
replaced with the route below.

## How this is kept out of a release build

`src/app/dev-brand-demo.tsx` renders `<BrandDirectionDemo />` only when
`isDevelopmentSimulatorEnabled` (`src/config/env.ts`) is true — the exact
same, already-shipped, already-audited double gate the Compliance
Fake-provider simulator uses: `__DEV__` is a build-time constant compiled
to `false` and dead-code-eliminated out of every release/EAS build
regardless of environment, **and** `EXPO_PUBLIC_APP_ENV` must explicitly be
`"development"`. Any internal/staging/production build renders a plain
"No disponible." fallback instead, structurally — not by relying on a file
naming convention.

## Opening the demo in local development (verified steps)

1. Use the default local `.env` (`EXPO_PUBLIC_APP_ENV=development`, already
   the repo's default — see `.env.example`).
2. Start the app as usual: `npm start` (or `npm run web` for a browser
   preview; `react-native-web` is already a dependency).
3. Navigate to `/dev-brand-demo`:
   - **Web**: open `http://localhost:8081/dev-brand-demo` directly (adjust
     the port to whatever Metro printed).
   - **Native (simulator/device)**: easiest is a one-line temporary edit —
     add `onPress={() => router.push("/dev-brand-demo")}` to any already-
     visible button (e.g. Profile's existing "Configurar notificaciones"
     button) for the session, or trigger it via Metro's dev menu deep link
     (`npx uri-scheme open exp://127.0.0.1:8081/--/dev-brand-demo --ios`,
     substituting `--android` as needed).
   - This file path (`src/app/dev-brand-demo.tsx` → route `/dev-brand-demo`)
     was verified by direct analogy against the project's own known-working
     sibling route `src/app/leave-organization.tsx` → `/leave-organization`
     (navigated to today via `router.push` in the real `profile.tsx`) — both
     are flat, hyphenated top-level filenames, scanned identically by
     Expo Router's own file-scanning step (see the correction above).

## What it shows

Three variants (`src/design-system/demo/brandDemoPalettes.ts`):

| Variant | What it is |
| --- | --- |
| `current` | Exactly what's shipped today (`theme.ts`'s live `themes.light`) |
| `proposalA` | The official dark theme (`themes.dark`), unmodified -- restores the documented default ("Tema oscuro por defecto en el producto"), minimal extra styling |
| `proposalB` | Same dark base, plus a few additional *derived* accents (all existing tokens used in new spots -- icon chips, one featured-card wash, one actionable-card bar), each one gated on real, currently-displayed data -- see `BrandDirectionDemo.tsx`'s own docblock for the exact rule |

Two screens (Home, Perfil) with synthetic data, each with a 4-way state
switcher (`Con datos` / `Cargando` / `Vacío` / `Error`) matching the real
`SectionCard`/`EmptyState`/`ErrorState` state machine. Profile's action
buttons are grouped under a labeled "ACCIONES DE CUENTA" block (destructive
action in the `peligro`/`danger` variant, per the component spec) with
"Aviso de privacidad" standalone as the last element on the screen — see
the "known difference from the real screen" comment in
`BrandDirectionDemo.tsx`'s `ProfileDemo` for exactly how this differs from
today's shipped button order, flagged for product to confirm rather than
assumed.

All interactive demo controls (`DemoButton`, `DemoBadge`) keep a minimum
44px touch target via `hitSlop` (mirroring the real `Button.tsx`'s own
`touchHitSlop`, which this demo's first pass had omitted) and use
`minHeight` rather than a fixed `height`, so a larger OS text-size setting
makes the control grow instead of clipping the label.

## Removing this before/instead of adopting a direction

Delete `src/design-system/demo/` and `src/app/dev-brand-demo.tsx`. Nothing
else references them.
