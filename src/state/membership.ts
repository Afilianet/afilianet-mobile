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
type CaptureSetting = Pick<Organization, "identity_verification_available">;
type AssistedSetting = Pick<Organization, "assisted_enrollment_available">;

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

/**
 * New identity-verification capture (camera, document, liveness, location) may
 * be offered in this organization. Only an explicit `false` (API #86, or a
 * `kyc_unavailable` refusal recorded by OrganizationProvider) turns it off; a
 * missing field is unknown and keeps the previous behaviour. The capture
 * routes refuse on their own whatever this says: it only avoids offering
 * something the server will refuse. Reading existing cases is never gated.
 */
export function identityCaptureAvailable(organization: CaptureSetting | null | undefined): boolean {
  return organization?.identity_verification_available !== false;
}

/**
 * NEW assisted enrollments ("Registrar a alguien", including drafts saved
 * offline) may be offered in this organization. Same rule as capture: only an
 * explicit `false` (from the server's list, or an `assisted_enrollment_unavailable`
 * refusal recorded by OrganizationProvider) turns it off; a missing field is
 * unknown and keeps the previous behaviour, leaving the decision to the API,
 * whose create route refuses on its own. Enrollments that already exist, and
 * their verification, are never gated by this.
 */
export function assistedEnrollmentAvailable(organization: AssistedSetting | null | undefined): boolean {
  return organization?.assisted_enrollment_available !== false;
}

/**
 * «Incorporarme como afiliado» (API #158): only what the server says for this
 * organization; a missing field is "not available". The POST refuses on its
 * own for anyone but the active owner (403 not_owner).
 */
export function ownerSelfEnrollment(organization: Pick<Organization, "affiliate_self_enrollment"> | null | undefined): { available: boolean; suggested: boolean } {
  const value = organization?.affiliate_self_enrollment;
  const available = value?.available === true;
  return { available, suggested: available && value?.suggested === true };
}
