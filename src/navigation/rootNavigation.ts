import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

/**
 * The root navigator is a stack (app/_layout.tsx): the sections with the
 * bottom bar -- the `(app)` group: Inicio, Red, Ventas, Monedero, Perfil and
 * Encuestas -- and, on top of them, the screens without a bar (notifications,
 * the referral link, capture flows...). «Cerrar» or «atrás» on one of those
 * returns to the section it was opened from (docs/NAVEGACION_BARRA_INFERIOR_ES.md).
 */
type Navigation = Pick<Router, "canDismiss" | "dismissAll" | "dismissTo" | "push" | "replace">;

/** A path inside the `(app)` group, i.e. a section with the bottom bar. */
export function isSectionPath(path: string): boolean {
  return path === "/" || path === "/(app)" || path.startsWith("/(app)/") || path === "/surveys" || path.startsWith("/surveys/");
}

/**
 * From a screen without the bar: a section is reached by closing the screens
 * on top of the existing bar (never a second copy of it underneath); any other
 * screen is opened on top, so «atrás» comes back here. Only for screens
 * outside `(app)`: inside it, push as usual (dismissTo would not move there).
 */
export function openFromOverlay(router: Pick<Navigation, "dismissTo" | "push">, path: string): void {
  if (isSectionPath(path)) router.dismissTo(path as never);
  else router.push(path as never);
}

/**
 * Leaving a screen without the bar for good (an organization chosen, the
 * organization left, an invitation accepted): a section closes it onto the
 * existing bar -- or, with none underneath, replaces it; any other screen
 * replaces it as before.
 */
export function closeTo(router: Pick<Navigation, "dismissTo" | "replace">, path: string): void {
  if (isSectionPath(path)) router.dismissTo(path as never);
  else router.replace(path as never);
}

/**
 * Redirects (sign-in, sign-out, organization, privacy review) start over: the
 * screens of the previous state are closed first, so «atrás» never returns to
 * them (e.g. a signed-out session's sections under the login).
 */
export function resetTo(router: Pick<Navigation, "canDismiss" | "dismissAll" | "replace">, path: string): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(path as never);
}
