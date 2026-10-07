import { routes } from "./routes";

// Route segments reachable regardless of organization state (zero orgs, a
// failed org load, or an org-choice still pending) -- account-level or
// platform-wide screens that never need tenant context.
const EXEMPT_SEGMENTS = new Set([
  "delete-account",
  "privacy",
  "leave-organization",
  "no-organization",
  "platform-notifications",
  "staff-invite",
]);

/**
 * Whether the current route is reachable regardless of organization state.
 * Most exemptions are top-level segments (EXEMPT_SEGMENTS above), but the
 * profile screen lives under the (app) tab group alongside Home/Network/
 * Sales/Wallet, which still assume an organization in places (see
 * SectionCard's `enabled` prop -- only Home's cards were adapted for zero
 * organizations, not Network/Sales/Wallet) -- so this deliberately does
 * NOT exempt the whole "(app)" segment, only "(app)/profile" specifically,
 * the one no-organization.tsx actually links to ("Ver mi perfil").
 * Exempting the whole group would let a zero-organization user reach
 * those other, not-yet-adapted tabs too.
 */
export function isExemptRoute(segments: readonly string[]): boolean {
  if (EXEMPT_SEGMENTS.has(segments[0])) return true;
  if (segments[0] === "(app)" && segments[1] === "profile") return true;

  return false;
}

export interface ResolveRedirectParams {
  authStatus: "loading" | "signedOut" | "signedIn";
  orgStatus: "idle" | "loading" | "ready" | "error";
  hasActiveOrganization: boolean;
  organizationsCount: number;
  segments: readonly string[];
}

/**
 * The single source of truth for RootNavigation's redirect decision --
 * extracted into a plain, side-effect-free function (no React, no router)
 * so it can be exercised directly in a test with the exact same logic
 * production uses, without needing to mount the whole app shell (fonts,
 * Sentry, splash screen). Returns the route to redirect to, or null if the
 * current route should be left alone.
 */
export function resolveRedirect({
  authStatus,
  orgStatus,
  hasActiveOrganization,
  organizationsCount,
  segments,
}: ResolveRedirectParams): string | null {
  if (authStatus === "loading") return null;

  const inAuthGroup = segments[0] === "(auth)";
  const inJoin = segments[0] === "join";
  const inStaffInvite = segments[0] === "staff-invite";
  const inOrganizationPicker = segments[0] === "organization-picker";
  const inExemptRoute = isExemptRoute(segments);

  if (authStatus === "signedOut") {
    if (!inAuthGroup && !inJoin && !inStaffInvite && segments[0] !== "privacy") return routes.login;

    return null;
  }

  if (inAuthGroup || inJoin) return routes.home;

  const needsOrganizationChoice = orgStatus === "ready" && !hasActiveOrganization && organizationsCount > 1;
  if (needsOrganizationChoice && !inOrganizationPicker && !inExemptRoute) return routes.organizationPicker;

  // Zero organizations is a real, stable account state (not "still loading
  // a choice") -- see MembershipService::leave() on the backend, which
  // lets a user leave their last organization and keep their account.
  const needsNoOrganizationScreen = orgStatus === "ready" && organizationsCount === 0;
  const inNoOrganizationScreen = segments[0] === "no-organization";
  if (needsNoOrganizationScreen && !inNoOrganizationScreen && !inExemptRoute) return routes.noOrganization;

  return null;
}
