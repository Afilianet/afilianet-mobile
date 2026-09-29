// Until the HTTPS join landing page and universal links are deployed, the
// installed app handles its registered scheme directly. Both identifiers are
// required: affiliate codes are scoped to organizations in afilianet-api.
const REFERRAL_BASE_URL = "afilianetmobile://join";

export function buildReferralUrl(organizationId: string, affiliateCode: string): string {
  return `${REFERRAL_BASE_URL}/${encodeURIComponent(organizationId)}/${encodeURIComponent(affiliateCode)}`;
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
