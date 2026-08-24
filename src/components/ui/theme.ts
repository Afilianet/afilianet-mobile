/**
 * Thin re-export of the official design system (src/design-system/theme.ts),
 * kept under these names so existing imports across the app don't need to
 * change. Do not add values here directly -- extend
 * src/design-system/tokens.ts (mirrors the official afilianet.tokens.json)
 * and src/design-system/theme.ts instead. See src/design-system/README.md.
 */
export { colors, radius, spacing, typography, motion, shadows, measures, type BadgeTone } from "../../design-system/theme";
