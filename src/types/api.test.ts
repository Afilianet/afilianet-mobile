import { toOrganizationMembership, type Organization } from "./api";

const baseOrg: Organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("toOrganizationMembership", () => {
  it("returns null when the pivot fields aren't loaded", () => {
    expect(toOrganizationMembership(baseOrg)).toBeNull();
  });

  it("derives role/status from the pivot fields when present", () => {
    const org = { ...baseOrg, my_role: "owner", my_membership_status: "active" };
    expect(toOrganizationMembership(org)).toEqual({
      organization: org,
      role: "owner",
      status: "active",
    });
  });
});
