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
- `src/app/_dev/brand-demo.tsx` — the only route-adjacent file. Expo Router
  ignores any path with an underscore-prefixed segment, so `_dev/` creates
  **no navigable route** — it cannot be reached from the app's real
  navigation, deep links, or `expo-router`'s own route table.
- No navigation, API, permissions, or business-logic code was touched.
  `Icon` and `Avatar` are the real, unmodified components (both already take
  color/tone as explicit props). `Card`/`Badge`/`Button`/`Skeleton` have
  demo-local, visually-faithful counterparts in `DemoPrimitives.tsx` instead
  of the real ones, because the real ones import the single global `colors`
  object from `src/components/ui/theme.ts` and bake its values into
  module-level constants at import time -- there is no way to render three
  palettes side-by-side through them without either mutating that shared,
  production-wide singleton (unsafe: any other mounted screen reading the
  same module would see it change) or restructuring them to accept a theme
  prop (a real change to production components, out of scope for an
  isolated demo). The demo-local versions use the exact same spacing/
  radius/typography/motion **tokens** (imported directly from the real
  `theme.ts` -- those values don't change between light/dark) and the same
  component spec (`design/handoff/especificacion/componentes.md`), just
  parameterized by an explicit `palette` prop.

## What it shows

Three variants (`src/design-system/demo/brandDemoPalettes.ts`):

| Variant | What it is |
| --- | --- |
| `current` | Exactly what's shipped today (`theme.ts`'s live `themes.light`) |
| `proposalA` | The official dark theme (`themes.dark`), unmodified -- restores the documented default ("Tema oscuro por defecto en el producto"), minimal extra styling |
| `proposalB` | Same dark base, plus a few additional *derived* accents (all existing tokens used in new spots -- icon chips, one featured-card wash, one actionable-card bar) |

Two screens (Home, Perfil) with synthetic data, each with a 4-way state
switcher (`Con datos` / `Cargando` / `Vacío` / `Error`) matching the real
`SectionCard`/`EmptyState`/`ErrorState` state machine.

## Removing this before/instead of adopting a direction

Delete `src/design-system/demo/` and `src/app/_dev/brand-demo.tsx`. Nothing
else references them.
