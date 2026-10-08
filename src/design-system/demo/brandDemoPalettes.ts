/**
 * Isolated visual-direction demo ONLY. Nothing here is imported by any
 * production screen -- see src/design-system/demo/README.md.
 *
 * Every color value below is read from tokens.ts (the 1:1 mirror of the
 * official design/handoff/tokens/afilianet.tokens.json). No hex is
 * invented here; see that README for the exact source of each addition.
 *
 * Three variants, for side-by-side comparison:
 * - `current`: exactly src/design-system/theme.ts's live `colors` export
 *   today (themes.light) -- the shipped baseline.
 * - `proposalA`: themes.dark, resolved the same way theme.ts resolves
 *   themes.light today. This is the official product default per
 *   design/handoff/guia/implementacion.md §2 ("Tema oscuro por defecto en
 *   el producto; claro solo en landing, documentos y correo") --
 *   restoring it is a compliance fix, not a new design.
 * - `proposalB`: the same dark base as A, plus a handful of additional
 *   *derived* accent values -- every one of them is an existing palette/
 *   semantic token used in a new spot, never a new color.
 */
import { aqua, night, palette, semantic, themes, violet } from "../tokens";

export interface BrandPalette {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnBrand: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  focusRing: string;
  semantic: typeof semantic;
  /**
   * Demo-only derived accents -- `null` for `current`/`proposalA` (meaning
   * "this variant has no such accent at all," never a transparent color to
   * render), real token values for `proposalB` only. Callers must treat
   * `null` as "fall back to the normal, unaccented appearance" -- see
   * DemoPrimitives.tsx's DemoCard/DemoIconChip, which do exactly that,
   * rather than painting a literal transparent fill/border over the normal
   * one (the bug this comment replaced: `featured`/`actionable` requested
   * by a caller used to render as see-through on current/A instead of
   * silently no-op'ing).
   */
  accent: {
    /** Tints a featured hero card's background -- semantic.brand.overDark, the exact token Badge's own "marca" tone already uses, just applied to a card instead of a pill. proposalB only. */
    featuredCardWash: string | null;
    /** 4px left bar marking the one primary-actionable card per screen -- violet-500, the same value Button's own primary background already is ("violeta es acción, no decoración": this marks the action, it doesn't decorate a large surface). proposalB only. */
    actionableBar: string | null;
    /**
     * Per-semantic-tone icon-chip wash, reusing the exact overDark values
     * Badge already uses for text. proposalB only (null elsewhere).
     * Callers MUST pick the tone from the real, currently-displayed data
     * (e.g. the same `tone` a Badge below it already renders from
     * statusMapping.ts) -- never assign a tone by a section's name/subject
     * ("Comisiones" is not inherently success-toned; a specific *liquidada*
     * row is). See guia/implementacion.md §2: "aqua solo para dinero
     * liberado... alerta solo si existe espera real."
     */
    iconChip: { brand: string | null; success: string | null; warning: string | null; danger: string | null };
  };
}

function resolve(base: (typeof themes)["dark"] | (typeof themes)["light"], accent: BrandPalette["accent"]): BrandPalette {
  return {
    background: base.background,
    surface: base.surface,
    surfaceRaised: base.surfaceRaised,
    surfaceElevated: base.surfaceElevated,
    border: base.borderSoft,
    borderStrong: base.borderStrong,
    textPrimary: base.textPrimary,
    textSecondary: base.textSecondary,
    textTertiary: base.textTertiary,
    textOnBrand: base.textOnBrand,
    primary: base.actionPrimary,
    primaryHover: base.actionPrimaryHover,
    primaryActive: base.actionPrimaryActive,
    focusRing: base.focusRing,
    semantic,
    accent,
  };
}

const noAccent: BrandPalette["accent"] = {
  featuredCardWash: null,
  actionableBar: null,
  iconChip: { brand: null, success: null, warning: null, danger: null },
};

export const brandVariants: Record<"current" | "proposalA" | "proposalB", BrandPalette> = {
  current: resolve(themes.light, noAccent),
  proposalA: resolve(themes.dark, noAccent),
  proposalB: resolve(themes.dark, {
    featuredCardWash: semantic.brand.overDark,
    actionableBar: palette.violet[500],
    iconChip: {
      brand: semantic.brand.overDark,
      success: semantic.success.overDark,
      warning: semantic.warning.overDark,
      danger: semantic.danger.overDark,
    },
  }),
};

export type BrandVariantKey = keyof typeof brandVariants;

export const brandVariantLabels: Record<BrandVariantKey, string> = {
  current: "Actual (claro)",
  proposalA: "Propuesta A — oscuro oficial",
  proposalB: "Propuesta B — oscuro + color",
};

// Re-exported purely so the demo screen can show raw swatches without a
// second import line -- same tokens as above, nothing new.
export { aqua, night, violet };
