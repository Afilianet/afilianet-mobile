import { isExemptRoute, resolveRedirect, type ResolveRedirectParams } from "../../navigation/rootNavigationGuard";

function params(overrides: Partial<ResolveRedirectParams> = {}): ResolveRedirectParams {
  return {
    authStatus: "signedIn",
    orgStatus: "ready",
    hasActiveOrganization: false,
    organizationsCount: 0,
    segments: ["(app)"],
    ...overrides,
  };
}

describe("resolveRedirect: zero-organization case", () => {
  it("redirects an unexempt (app) route to /no-organization when organizations.length === 0", () => {
    expect(resolveRedirect(params({ segments: ["(app)"] }))).toBe("/no-organization");
  });

  it("does NOT redirect (app)/profile away, even with zero organizations -- the real fix for this phase", () => {
    expect(resolveRedirect(params({ segments: ["(app)", "profile"] }))).toBeNull();
  });

  it("still redirects other (app) tabs (e.g. network) with zero organizations -- never indiscriminately exempts the whole group", () => {
    expect(resolveRedirect(params({ segments: ["(app)", "network"] }))).toBe("/no-organization");
    expect(resolveRedirect(params({ segments: ["(app)", "sales"] }))).toBe("/no-organization");
    expect(resolveRedirect(params({ segments: ["(app)", "wallet"] }))).toBe("/no-organization");
  });

  it("does not redirect away from no-organization itself, or from platform-notifications/staff-invite", () => {
    expect(resolveRedirect(params({ segments: ["no-organization"] }))).toBeNull();
    expect(resolveRedirect(params({ segments: ["platform-notifications"] }))).toBeNull();
    expect(resolveRedirect(params({ segments: ["staff-invite", "some-token"] }))).toBeNull();
  });

  it("does not redirect once an organization becomes active", () => {
    expect(resolveRedirect(params({ segments: ["(app)"], organizationsCount: 1, hasActiveOrganization: true }))).toBeNull();
  });

  it("does not redirect while still loading or before the organization load finishes", () => {
    expect(resolveRedirect(params({ authStatus: "loading", organizationsCount: 0 }))).toBeNull();
    expect(resolveRedirect(params({ orgStatus: "loading", organizationsCount: 0 }))).toBeNull();
  });
});

describe("resolveRedirect: multi-organization and auth cases (regression -- unchanged behavior)", () => {
  it("redirects to the organization picker when more than one organization exists and none is active", () => {
    expect(resolveRedirect(params({ segments: ["(app)"], organizationsCount: 2, hasActiveOrganization: false }))).toBe(
      "/organization-picker",
    );
  });

  it("never redirects to the organization picker from an exempt route", () => {
    expect(resolveRedirect(params({ segments: ["privacy"], organizationsCount: 2 }))).toBeNull();
  });

  it("redirects a signed-out visitor to login, except for the join/staff-invite/privacy flows", () => {
    expect(resolveRedirect(params({ authStatus: "signedOut", segments: ["(app)"] }))).toBe("/(auth)/login");
    expect(resolveRedirect(params({ authStatus: "signedOut", segments: ["join"] }))).toBeNull();
    expect(resolveRedirect(params({ authStatus: "signedOut", segments: ["staff-invite", "tok"] }))).toBeNull();
    expect(resolveRedirect(params({ authStatus: "signedOut", segments: ["privacy"] }))).toBeNull();
  });

  it("bounces a signed-in user out of the auth group or join flow back home", () => {
    expect(resolveRedirect(params({ segments: ["(auth)", "login"] }))).toBe("/(app)");
    expect(resolveRedirect(params({ segments: ["join", "org-1", "code"] }))).toBe("/(app)");
  });
});

describe("isExemptRoute", () => {
  it("matches every documented exempt top-level segment", () => {
    for (const segment of ["delete-account", "privacy", "leave-organization", "no-organization", "platform-notifications", "staff-invite"]) {
      expect(isExemptRoute([segment])).toBe(true);
    }
  });

  it("matches (app)/profile specifically, not any other (app) tab", () => {
    expect(isExemptRoute(["(app)", "profile"])).toBe(true);
    expect(isExemptRoute(["(app)", "network"])).toBe(false);
    expect(isExemptRoute(["(app)"])).toBe(false);
  });
});
