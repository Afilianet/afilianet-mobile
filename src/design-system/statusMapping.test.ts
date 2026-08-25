import {
  affiliateStatusCopy,
  commissionStatusCopy,
  complianceStatusCopy,
  invitationStatusCopy,
  ledgerEntryStatusCopy,
  payoutStatusCopy,
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

describe("payoutStatusCopy", () => {
  it("maps every PayoutStatus enum case, including in-flight statuses as warning", () => {
    expect(payoutStatusCopy("requested").tone).toBe("warning");
    expect(payoutStatusCopy("processing").tone).toBe("warning");
    expect(payoutStatusCopy("paid").tone).toBe("success");
    expect(payoutStatusCopy("failed").tone).toBe("danger");
    expect(payoutStatusCopy("cancelled").tone).toBe("neutral");
  });

  it("provides plain-language explanations for every status", () => {
    expect(payoutStatusCopy("requested").description).toMatch(/reserved/i);
    expect(payoutStatusCopy("processing").description).toMatch(/reserved/i);
    expect(payoutStatusCopy("paid").description).toMatch(/ledger was debited/i);
    expect(payoutStatusCopy("failed").description).toMatch(/reservation was released/i);
    expect(payoutStatusCopy("cancelled").description).toMatch(/reservation was released/i);
  });

  it("never implies a ledger refund for failed/cancelled", () => {
    expect(payoutStatusCopy("failed").description).not.toMatch(/refund/i);
    expect(payoutStatusCopy("cancelled").description).not.toMatch(/refund/i);
  });

  it("falls back safely for an unknown status", () => {
    expect(payoutStatusCopy("something-new").tone).toBe("neutral");
  });
});
