import {
  affiliateStatusCopy,
  commissionStatusCopy,
  complianceStatusCopy,
  invitationStatusCopy,
  ledgerEntryStatusCopy,
} from "./statusMapping";

describe("affiliateStatusCopy", () => {
  it("maps every AffiliateStatus enum case per the official semantic rules", () => {
    expect(affiliateStatusCopy("pending").tone).toBe("warning");
    expect(affiliateStatusCopy("active").tone).toBe("success");
    expect(affiliateStatusCopy("suspended").tone).toBe("danger");
    expect(affiliateStatusCopy("terminated").tone).toBe("danger");
  });

  it("falls back safely for an unknown status", () => {
    const copy = affiliateStatusCopy("something-new");
    expect(copy.tone).toBe("neutral");
    expect(copy.label).toBeTruthy();
  });
});

describe("complianceStatusCopy", () => {
  it("maps every ComplianceStatus enum case per the official semantic rules", () => {
    expect(complianceStatusCopy("not_started").tone).toBe("neutral");
    expect(complianceStatusCopy("in_progress").tone).toBe("warning");
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
  it("maps every CommissionStatus enum case per the official semantic rules", () => {
    expect(commissionStatusCopy("pending").tone).toBe("warning");
    expect(commissionStatusCopy("earned").tone).toBe("success");
    expect(commissionStatusCopy("reversed").tone).toBe("danger");
    expect(commissionStatusCopy("void").tone).toBe("neutral");
  });

  it("falls back safely for an unknown status", () => {
    expect(commissionStatusCopy("something-new").tone).toBe("neutral");
  });
});

describe("invitationStatusCopy", () => {
  it("maps every InvitationStatus enum case (using the backend's effective status)", () => {
    expect(invitationStatusCopy("pending").tone).toBe("warning");
    expect(invitationStatusCopy("accepted").tone).toBe("success");
    expect(invitationStatusCopy("expired").tone).toBe("neutral");
    expect(invitationStatusCopy("revoked").tone).toBe("danger");
  });

  it("falls back safely for an unknown status", () => {
    expect(invitationStatusCopy("something-new").tone).toBe("neutral");
  });
});

describe("ledgerEntryStatusCopy", () => {
  it("maps the ledger entry's effective status", () => {
    expect(ledgerEntryStatusCopy("pending").tone).toBe("warning");
    expect(ledgerEntryStatusCopy("available").tone).toBe("success");
    expect(ledgerEntryStatusCopy("reversed").tone).toBe("danger");
  });

  it("falls back safely for an unknown status", () => {
    expect(ledgerEntryStatusCopy("something-new").tone).toBe("neutral");
  });
});
