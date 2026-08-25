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
} as const;

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
