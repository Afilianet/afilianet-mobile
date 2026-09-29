import { buildReferralUrl, canShareReferral } from "./referral";

describe("buildReferralUrl", () => {
  it("uses the installed app scheme outside staging", () => {
    expect(buildReferralUrl("org-1", "AFF100", "development")).toBe("afilianetmobile://join/org-1/AFF100");
  });
  it("opens public HTTPS registration in staging", () => {
    expect(buildReferralUrl("org-1", "AFF100", "staging")).toBe("https://staging-admin.afilianet.mx/join/org-1/AFF100");
  });
  it("URL-encodes organization and affiliate code", () => {
    expect(buildReferralUrl("org/a", "AFF 100/ x", "staging")).toBe("https://staging-admin.afilianet.mx/join/org%2Fa/AFF%20100%2F%20x");
  });
});

describe("canShareReferral", () => {
  it("allows only active and pending affiliates", () => {
    expect(canShareReferral("active")).toBe(true);
    expect(canShareReferral("pending")).toBe(true);
    expect(canShareReferral("suspended")).toBe(false);
    expect(canShareReferral("terminated")).toBe(false);
  });
});
