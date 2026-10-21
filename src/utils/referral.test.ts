import { buildReferralUrl, buildWhatsappShareUrl, canShareReferral, isLinkTappableInChats } from "./referral";

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

describe("buildWhatsappShareUrl", () => {
  it("prefills the message on wa.me, URL-encoded, with no recipient", () => {
    expect(buildWhatsappShareUrl("Únete a Afilianet: https://staging-admin.afilianet.mx/join/org-1/AFF100?x=1&y=2")).toBe(
      "https://wa.me/?text=%C3%9Anete%20a%20Afilianet%3A%20https%3A%2F%2Fstaging-admin.afilianet.mx%2Fjoin%2Forg-1%2FAFF100%3Fx%3D1%26y%3D2",
    );
  });
});

describe("isLinkTappableInChats", () => {
  it("accepts only HTTPS links - the installed-app scheme is not tappable in a chat", () => {
    expect(isLinkTappableInChats(buildReferralUrl("org-1", "AFF100", "staging"))).toBe(true);
    expect(isLinkTappableInChats(buildReferralUrl("org-1", "AFF100", "development"))).toBe(false);
    expect(isLinkTappableInChats(buildReferralUrl("org-1", "AFF100", "production"))).toBe(false);
  });
});
