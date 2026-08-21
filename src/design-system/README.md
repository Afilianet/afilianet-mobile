# Design system

This module is the native implementation of the official Afilianet brand system. It exists so
that every visual value in the app — color, type, spacing, radius, motion, icon — traces back to
one file instead of being invented per screen.

## Source of truth

The official design handoff lives at `design/handoff/` (not published, checked into this repo for
reference). Within it, in order of authority when two sources disagree:

1. `design/handoff/tokens/afilianet.tokens.json` — the single source of truth for every color,
   type scale value, spacing/radius/border value, motion duration/easing, and measurement.
2. `design/handoff/especificacion/componentes.md` — the written component spec (sizes, variants,
   states).
3. `design/handoff/guia/implementacion.md` — prose implementation guidance.
4. `design/handoff/codigo/**` — reference React/CSS components. **These are web-only reference
   material, not code to port.** They use DOM APIs, CSS custom properties, and mouse events that
   don't exist in React Native. Treat them as a description of intended visual behavior, not as
   a source to copy from. ESLint does not lint this directory (see `eslint.config.js`) — it isn't
   app code.

A handful of real contradictions between these sources were found and resolved (JSON wins) during
the initial brand integration; see the Phase 7A.2 final report / git history for the full list
(e.g. button sizes, the "peligro" button treatment, badge "neutro" colors).

## How the JSON maps into code

- **`tokens.ts`** is a direct, flat TypeScript mirror of `afilianet.tokens.json` — raw palettes
  (`violet`, `night`, `aqua`), semantic color groups, font scale/weights, spacing/radius/border
  scales, motion, and measurements. Nothing is resolved or renamed here; it's a 1:1 transcription.
- **`theme.ts`** resolves `tokens.ts` into the flat, ergonomic shape components actually consume:
  `colors`, `spacing`, `radius`, `border`, `typography`, `motion`, `measures`, `shadows`. This is
  the only place light/dark theme selection happens. The official default theme is **dark** —
  there is no user-facing theme switcher yet, but `theme.ts` is structured so adding one later
  means resolving `themes.light` instead of hardcoding `themes.dark`, not restructuring consumers.
- **`statusMapping.ts`** centralizes domain-status → semantic-tone mapping (affiliate, compliance,
  commission statuses) so no screen hardcodes its own color logic. Add new statuses here, not in a
  screen.
- **`icons/paths.ts` + `icons/Icon.tsx`** hand-transcribe the 24 official SVGs
  (`design/handoff/assets/iconos/*.svg`) into a typed shape registry rendered via
  `react-native-svg`. **To add a new official icon**: transcribe its path/shape data into
  `iconPaths` in `paths.ts`, add its name to the `IconName` union, then use
  `<Icon name="..." />`. There is no build-time SVG-to-component step.
- **`icons/Logo.tsx`** renders the isotipo mark (SVG) and the "Afilianet" wordmark (native `Text`
  using the loaded Manrope font) separately, rather than embedding text inside the SVG — RN's SVG
  text support is less reliable across platforms than native `Text`.

`src/components/ui/theme.ts` (the pre-existing import path used across the app) is a thin
re-export of `theme.ts` under the same names, so screens and components don't import from
`design-system/` directly.

## Fonts

Manrope (400/500/600/700/800) and JetBrains Mono (400/500/700) are bundled as real font binaries
via `@expo-google-fonts/manrope` and `@expo-google-fonts/jetbrains-mono` — loaded once via
`useFonts()` in the root layout, never fetched from a URL at runtime. `theme.ts`'s `fontFamilies`
maps each token weight to the exact loaded font name.

## Official assets

Logo, isotipo, icon set, app icon, and Android adaptive icon source files live under
`design/handoff/assets/`. App icon / adaptive icon / splash files actually referenced by
`app.json` are copied into `assets/brand/`. Never redraw, recolor, or otherwise alter an official
logo or icon asset — if a needed variant doesn't exist, that's a design question to raise, not a
value to invent.

## The rule

**No hardcoded hex/px/font values in components.** If a value isn't in `tokens.ts`, either it
should be sourced from an existing token differently, or it's genuinely missing from the handoff —
in which case raise it, don't invent one. This is the same rule the handoff itself states
("no improvisar valores nuevos").
