import type { BadgeTone } from "./theme";

interface StatusCopy {
  label: string;
  tone: BadgeTone;
  description?: string;
}

const FALLBACK: StatusCopy = { label: "Unknown", tone: "neutral" };

function lookup(map: Record<string, StatusCopy>, status: string): StatusCopy {
  return map[status] ?? FALLBACK;
}

/**
 * Centralized domain-status -> semantic-tone mapping (Phase 7A.2 §6):
 *   active / approved / paid / verified        -> success
 *   pending / in_progress / manual_review      -> warning
 *   suspended / blocked / rejected / reversed  -> error ("danger" tone)
 *   draft / archived / unavailable             -> neutral
 * No screen should decide a status's color itself -- extend the maps below.
 *
 * Two tones corrected here versus the ad-hoc Phase 7B.1 choices, now that
 * this rule table is official: AffiliateStatus.suspended was "warning",
 * ComplianceStatus.in_progress was "neutral", CommissionStatus.pending was
 * "neutral" -- all three are explicitly "pending"/"suspended" cases in the
 * rule above and are now warning/warning/error-bucket-adjacent accordingly.
 */

// app/Modules/Affiliates/Enums/AffiliateStatus.php
const AFFILIATE_STATUS: Record<string, StatusCopy> = {
  pending: { label: "Pending", tone: "warning" },
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  terminated: { label: "Terminated", tone: "danger" },
};

export function affiliateStatusCopy(status: string): StatusCopy {
  return lookup(AFFILIATE_STATUS, status);
}

// app/Modules/Identity/Enums/ComplianceStatus.php. "not_started" is never
// actually returned by GET /api/v1/compliance (a case doesn't exist until
// POST .../start is called) -- it's synthesized client-side when that
// endpoint 404s, but kept here so its copy lives in one place.
const COMPLIANCE_STATUS: Record<string, StatusCopy> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
    description: "Complete your verification to unlock full affiliate features.",
  },
  in_progress: { label: "In progress", tone: "warning", description: "Verification in progress." },
  pending_review: { label: "Pending review", tone: "warning", description: "We're reviewing your submission." },
  manual_review: { label: "Manual review", tone: "warning", description: "Your verification needs manual review." },
  approved: { label: "Approved", tone: "success" },
  rejected: {
    label: "Rejected",
    tone: "danger",
    description: "Your verification was rejected and needs attention.",
  },
  expired: { label: "Expired", tone: "danger", description: "Your verification has expired." },
};

export function complianceStatusCopy(status: string): StatusCopy {
  return lookup(COMPLIANCE_STATUS, status);
}

// app/Modules/Commissions/Enums/CommissionStatus.php
const COMMISSION_STATUS: Record<string, StatusCopy> = {
  pending: { label: "Pending", tone: "warning" },
  earned: { label: "Earned", tone: "success" },
  reversed: { label: "Reversed", tone: "danger" },
  void: { label: "Void", tone: "neutral" },
};

export function commissionStatusCopy(status: string): StatusCopy {
  return lookup(COMMISSION_STATUS, status);
}

// app/Modules/Identity/Enums/InvitationStatus.php. "expired" is intentionally
// neutral rather than danger here (unlike ComplianceStatus.expired) -- an
// expired invitation isn't a failure needing the sponsor's action, it's just
// a lapsed, no-longer-actionable link, closer to the official rule's
// "draft/archived/unavailable -> neutral" bucket than to an error state.
const INVITATION_STATUS: Record<string, StatusCopy> = {
  pending: { label: "Pending", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Revoked", tone: "danger" },
};

export function invitationStatusCopy(status: string): StatusCopy {
  return lookup(INVITATION_STATUS, status);
}

// app/Modules/Ledger/Enums/LedgerEntryStatus.php -- exactly 3 values,
// confirmed against the enum's own docblock. `status` in the API response
// is already effectiveStatus() (a stored "pending" row whose available_at
// has passed reports as "available" here, computed server-side). "reversed"
// is a real third value: a reversal entry is terminal and never itself
// matures or gets reversed, and is toned "danger" for the same reason
// CommissionStatus.reversed is -- it represents money taken back.
const LEDGER_ENTRY_STATUS: Record<string, StatusCopy> = {
  pending: { label: "Pending", tone: "warning" },
  available: { label: "Available", tone: "success" },
  reversed: { label: "Reversed", tone: "danger" },
};

export function ledgerEntryStatusCopy(status: string): StatusCopy {
  return lookup(LEDGER_ENTRY_STATUS, status);
}

// app/Modules/Payments/Enums/PayoutStatus.php. requested/processing both
// mean "reserved, not yet paid" -- warning, matching the same bucket every
// other domain uses for an in-flight/not-yet-final state. paid -> success.
// failed/cancelled -> danger/neutral respectively: failed is an error the
// affiliate may want to act on (e.g. fix a destination), cancelled was the
// affiliate's own choice and isn't a failure.
const PAYOUT_STATUS: Record<string, StatusCopy> = {
  requested: {
    label: "Requested",
    tone: "warning",
    description: "The withdrawal has been requested and that amount is reserved.",
  },
  processing: {
    label: "Processing",
    tone: "warning",
    description: "The payout is being processed and remains reserved.",
  },
  paid: {
    label: "Paid",
    tone: "success",
    description: "The payout was confirmed and the wallet ledger was debited.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    description: "The payout did not complete. The reservation was released.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    description: "The request was cancelled before payment. The reservation was released.",
  },
};

export function payoutStatusCopy(status: string): StatusCopy {
  return lookup(PAYOUT_STATUS, status);
}
