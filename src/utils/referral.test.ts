import { buildReferralUrl, canShareReferral } from "./referral";

describe("buildReferralUrl", () => {
  it("includes the organization and code in the installed app link", () => {
    expect(buildReferralUrl("org-1", "AFF100")).toBe("afilianetmobile://join/org-1/AFF100");
  });

  it("URL-encodes the affiliate code", () => {
    expect(buildReferralUrl("org/a", "AFF 100/ x")).toBe("afilianetmobile://join/org%2Fa/AFF%20100%2F%20x");
  });
});

describe("canShareReferral", () => {
  it("allows sharing for active and pending -- the statuses afilianet-api's ReferralResolver actually resolves", () => {
    expect(canShareReferral("active")).toBe(true);
    expect(canShareReferral("pending")).toBe(true);
  });

  it("disallows sharing for suspended and terminated -- statuses the backend resolves to a 404", () => {
    expect(canShareReferral("suspended")).toBe(false);
    expect(canShareReferral("terminated")).toBe(false);
  });

  it("defaults to disallowed for an unknown status", () => {
    expect(canShareReferral("something_new")).toBe(false);
  });
});
