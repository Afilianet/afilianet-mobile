import { affiliateStatusCopy, commissionStatusCopy, complianceStatusCopy } from "./statusCopy";

describe("affiliateStatusCopy", () => {
  it("maps every AffiliateStatus enum case", () => {
    expect(affiliateStatusCopy("pending").tone).toBe("neutral");
    expect(affiliateStatusCopy("active").tone).toBe("success");
    expect(affiliateStatusCopy("suspended").tone).toBe("warning");
    expect(affiliateStatusCopy("terminated").tone).toBe("danger");
  });

  it("falls back safely for an unknown status", () => {
    const copy = affiliateStatusCopy("something-new");
    expect(copy.tone).toBe("neutral");
    expect(copy.label).toBeTruthy();
  });
});

describe("complianceStatusCopy", () => {
  it("maps every ComplianceStatus enum case", () => {
    expect(complianceStatusCopy("not_started").tone).toBe("neutral");
    expect(complianceStatusCopy("in_progress").tone).toBe("neutral");
    expect(complianceStatusCopy("pending_review").tone).toBe("warning");
    expect(complianceStatusCopy("manual_review").tone).toBe("warning");
    expect(complianceStatusCopy("approved").tone).toBe("success");
    expect(complianceStatusCopy("rejected").tone).toBe("danger");
    expect(complianceStatusCopy("expired").tone).toBe("danger");
  });

  it("falls back safely for an unknown status", () => {
    expect(complianceStatusCopy("something-new").tone).toBe("neutral");
  });
});

describe("commissionStatusCopy", () => {
  it("maps every CommissionStatus enum case", () => {
    expect(commissionStatusCopy("pending").tone).toBe("neutral");
    expect(commissionStatusCopy("earned").tone).toBe("success");
    expect(commissionStatusCopy("reversed").tone).toBe("danger");
    expect(commissionStatusCopy("void").tone).toBe("neutral");
  });

  it("falls back safely for an unknown status", () => {
    expect(commissionStatusCopy("something-new").tone).toBe("neutral");
  });
});
