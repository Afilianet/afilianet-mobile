/**
 * Formats a decimal-string money amount (as returned by afilianet-api's
 * Money value object) for display only. Never use this for arithmetic --
 * combine amounts server-side, not in the client.
 */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}
