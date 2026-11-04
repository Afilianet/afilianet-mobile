import { wasRecorded, type RecordedPrivacy, type StepConsent } from "../api/privacy";

export interface SentConsent {
  title: string;
  consent: StepConsent;
}

interface Receipt {
  sent: SentConsent[];
  /** Set only once the API answered the account-creating step; null when it returned no `privacy`. */
  userId?: string;
  recorded?: RecordedPrivacy | null;
}

/**
 * What an account-creating step sent and what the API stored (registration
 * consents v1), kept in memory only until the next screen shows it. The step
 * starts the session itself, so the screen that shows it is a different one.
 */
let receipt: Receipt | null = null;

/** Before sending: what this attempt sends. Nothing is shown unless the API answers. */
export function startRegistrationReceipt(sent: SentConsent[]) {
  receipt = sent.length ? { sent } : null;
}

/** The API created the account: what it returned as stored, for that account only. */
export function completeRegistrationReceipt(userId: string, recorded: RecordedPrivacy | null | undefined) {
  if (receipt) receipt = { ...receipt, userId, recorded: recorded ?? null };
}

export function discardRegistrationReceipt() {
  receipt = null;
}

export interface ReceiptLine {
  title: string;
  recorded: boolean;
}

/** For this account only: each sent decision, recorded only if the API returned it as stored. */
export function peekRegistrationReceipt(userId: string): ReceiptLine[] | null {
  if (!receipt || receipt.userId !== userId) return null;
  const recorded = receipt.recorded;
  return receipt.sent.map((item) => ({ title: item.title, recorded: wasRecorded(recorded, item.consent) }));
}
