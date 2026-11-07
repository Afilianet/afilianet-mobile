import type { OutboxItem, OutboxReceipt } from "./outbox";

/**
 * This account's own («Responder yo») response to one version, as this phone
 * knows it: `sending` while it waits to be sent, `received` only once the
 * server confirmed it (an OutboxReceipt). Null otherwise -- also for receipts
 * recorded before they carried their version (never guessed by title), and
 * for a response the server refused (shown in «Envíos»).
 */
export type OwnSelfResponse = { kind: "sending" } | { kind: "received"; receivedAt: string } | null;

export function ownSelfResponse(
  versionId: string,
  items: Pick<OutboxItem, "versionId" | "respondentType" | "blocked">[],
  receipts: Pick<OutboxReceipt, "versionId" | "respondentType" | "receivedAt">[],
): OwnSelfResponse {
  // Answered again and not sent yet: that is what is happening now.
  if (items.some((item) => item.respondentType === "self" && item.versionId === versionId && !item.blocked)) return { kind: "sending" };
  const latest = receipts
    .filter((receipt) => receipt.respondentType === "self" && receipt.versionId === versionId)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  return latest ? { kind: "received", receivedAt: latest.receivedAt } : null;
}
