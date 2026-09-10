import { es } from "./es";

/**
 * The smallest localization architecture that fits this app today: a
 * single, statically-typed strings object, imported directly wherever
 * copy is needed (e.g. `import { strings } from "../i18n"`,
 * `strings.compliance.startVerification`) -- no runtime key-lookup, no
 * new dependency, fully type-checked (a typo in a key path is a compile
 * error, not a silent missing-translation fallback).
 *
 * Spanish is the default language, per product decision -- `strings`
 * resolves directly to `es`, not to a locale-detected/user-selected value.
 * Deliberately no device-locale detection or in-app language setting yet
 * (see the phase's own brief: "do not overengineer locale detection/settings
 * yet") -- when that's built, this is the one place it changes: resolve
 * `strings` to `es` or `en` based on the detected/selected locale instead
 * of the current unconditional export. `en.ts` already mirrors this exact
 * shape so that change never has to invent a new structure, just pick
 * between the two existing objects.
 */
export const strings = es;

export type Strings = typeof es;
