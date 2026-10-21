import type { Organization } from "../types/api";

/**
 * What this account is in the ACTIVE organization (API #75,
 * docs/organizations/STAFF_SIN_PERFIL_DE_AFILIADO.md):
 * - `my_role` decides management screens (owner/admin/manager);
 * - `has_affiliate_profile` decides personal affiliate features (own
 *   profile, network, sponsoring, own KYC, wallet), per organization.
 *
 * A missing `has_affiliate_profile` (an API before #75, or an organization
 * list saved offline before it) is UNKNOWN, never false: the app then keeps
 * its previous behaviour and lets the API answer. Only an explicit `false`
 * turns personal features off -- no call, no "No iniciada", no "Iniciar
 * verificación". Nothing here ever creates a profile or a KYC case.
 */
export type AffiliateProfilePresence = "present" | "absent" | "unknown";

type Membership = Pick<Organization, "my_role" | "my_membership_status" | "has_affiliate_profile">;

/** MembershipRole::canManageOrganization() in afilianet-api: staff, not affiliates. */
const STAFF_ROLES = new Set(["owner", "admin", "manager"]);

export function affiliateProfilePresence(organization: Membership | null | undefined): AffiliateProfilePresence {
  if (organization?.has_affiliate_profile === true) return "present";
  if (organization?.has_affiliate_profile === false) return "absent";
  return "unknown";
}

/** Personal affiliate endpoints may be called: an active organization whose profile is not known to be absent. */
export function hasPersonalAffiliateAccess(organization: Membership | null | undefined): boolean {
  return Boolean(organization) && affiliateProfilePresence(organization) !== "absent";
}

/** An active owner/admin/manager of this organization. The API still checks every request. */
export function isOrganizationStaff(organization: Membership | null | undefined): boolean {
  return organization?.my_membership_status === "active" && STAFF_ROLES.has(organization.my_role ?? "");
}
