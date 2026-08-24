// Referral URL convention, confirmed against afilianet-api (not a value the
// backend exposes via config or API response -- see that repo's README.md
// "Referral URLs" section and ReferralController's docblock): referral
// links are conceptually `https://app.afilianet.mx/join/{affiliate_code}`,
// and GET /api/v1/organizations/{organization}/referrals/{code} resolves
// one publicly. There is no FRONTEND_URL/APP_JOIN_URL-style config value
// anywhere in afilianet-api -- the domain is a fixed, documented
// convention, so it's a constant here rather than something read from env.
const REFERRAL_BASE_URL = "https://app.afilianet.mx/join";

/** Builds the one true referral URL for an affiliate code. Nothing else in this app should construct this string by hand. */
export function buildReferralUrl(affiliateCode: string): string {
  return `${REFERRAL_BASE_URL}/${encodeURIComponent(affiliateCode)}`;
}

// Mirrors afilianet-api's ReferralResolver (app/Modules/Affiliates/Services/ReferralResolver.php):
// only `active` and `pending` affiliates resolve a referral code; `suspended`
// and `terminated` resolve to null, and the public endpoint 404s. So sharing
// is disabled here for exactly the statuses whose links wouldn't work if
// someone followed them -- this isn't a cosmetic restriction, it mirrors an
// actual backend rule.
const SHAREABLE_STATUSES = new Set(["active", "pending"]);

export function canShareReferral(affiliateStatus: string): boolean {
  return SHAREABLE_STATUSES.has(affiliateStatus);
}
