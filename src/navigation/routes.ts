export const routes = {
  login: "/(auth)/login",
  home: "/(app)",
  network: "/(app)/network",
  sales: "/(app)/sales",
  wallet: "/(app)/wallet",
  profile: "/(app)/profile",
  organizationPicker: "/organization-picker",
  referral: "/referral",
  commissions: "/commissions",
  payouts: "/payouts",
  compliance: "/compliance",
  notifications: "/notifications",
} as const;

// The only screen values afilianet-api's notification listeners ever put in
// a notification's payload (app/Modules/Notifications/Listeners/Notify*.php)
// -- a short label, never a route or URL. Mapping through this fixed table
// (rather than trusting/interpolating the string directly) is what makes an
// unrecognized or tampered value fail safely to "no navigation" instead of
// an arbitrary destination.
const NOTIFICATION_SCREEN_ROUTES: Record<string, string> = {
  compliance: routes.compliance,
  profile: routes.profile,
  network: routes.network,
  commissions: routes.commissions,
  payouts: routes.payouts,
};

/** Returns the whitelisted destination for a notification's payload.screen, or null if absent/unrecognized. */
export function notificationDestination(screen: string | undefined): string | null {
  if (!screen) return null;
  return NOTIFICATION_SCREEN_ROUTES[screen] ?? null;
}

// A function, not a flat path: this is a top-level route (like referral/
// organization-picker) rather than nested under (app)/network/ -- Expo
// Router would otherwise have to resolve *both* the (app) group's
// network.tsx (URL "/network") and a nested network/[uuid] directory
// against the same "/network" URL segment, which risks an ambiguous route
// registration between a file and a same-named directory. A distinct
// top-level segment sidesteps that entirely.
export function networkAffiliateDetail(affiliateUuid: string): string {
  return `/network-affiliate/${affiliateUuid}`;
}

export function payoutRequest(currency: string): string {
  return `/payout-request/${currency}`;
}
