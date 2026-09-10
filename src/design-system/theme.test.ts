import { colors, radius, spacing, typography } from "./theme";
import { fontSize, fontWeight, night, semantic, spacingScale, violet } from "./tokens";

// Light-first baseline (see git history/theme.ts's own docblock): the app
// previously hardcoded tema.oscuro with no way to opt out, rendering fully
// dark regardless of device settings. This asserts against tema.claro's
// exact tokens.json values instead -- flip back to `night[950]`/etc. (see
// the old version of this test) if `theme.ts`'s `active` is ever switched
// back to `themes.dark`.
describe("theme (light, the current in-app default)", () => {
  it("resolves tema.claro aliases to the exact tokens.json values", () => {
    expect(colors.background).toBe(night[0]);
    expect(colors.surface).toBe(night[50]);
    expect(colors.surfaceRaised).toBe(violet[50]);
    expect(colors.border).toBe(night[100]);
    expect(colors.borderStrong).toBe(night[200]);
    expect(colors.textPrimary).toBe(night[950]);
    expect(colors.textSecondary).toBe(night[500]);
    expect(colors.textTertiary).toBe(night[500]);
    expect(colors.primary).toBe(violet[500]);
    expect(colors.primaryHover).toBe(violet[600]);
    expect(colors.primaryActive).toBe(violet[700]);
    expect(colors.focusRing).toBe(violet[300]);
  });

  it("keeps the pre-existing alias names pointing at the right values", () => {
    expect(colors.muted).toBe(colors.textTertiary);
    expect(colors.primaryText).toBe(colors.textOnBrand);
    expect(radius.full).toBe(radius.pill);
  });

  it("exposes semantic text colors matching semantico.*.texto", () => {
    expect(colors.success).toBe(semantic.success.text);
    expect(colors.warning).toBe(semantic.warning.text);
    expect(colors.danger).toBe(semantic.danger.text);
    expect(colors.brand).toBe(semantic.brand.text);
  });

  it("keeps spacing's semantic aliases equal to the official numeric scale", () => {
    expect(spacing.xs).toBe(spacingScale[1]);
    expect(spacing.sm).toBe(spacingScale[2]);
    expect(spacing.md).toBe(spacingScale[4]);
    expect(spacing.lg).toBe(spacingScale[6]);
    expect(spacing.xl).toBe(spacingScale[8]);
    expect(spacing[5]).toBe(20); // the official mobile gutter step
  });

  it("resolves typography roles to the official weight/size per role", () => {
    expect(typography.display.fontWeight).toBe(fontWeight.extra);
    expect(typography.display.fontSize).toBe(fontSize["4xl"]);
    expect(typography.body.fontWeight).toBe(fontWeight.regular);
    expect(typography.body.fontSize).toBe(fontSize.sm);
    expect(typography.label.fontSize).toBe(fontSize["3xs"]);
    expect(typography.label.textTransform).toBe("uppercase");
    expect(typography.numeric.fontFamily).toContain("JetBrainsMono");
    expect(typography.body.fontFamily).toContain("Manrope");
  });
});
