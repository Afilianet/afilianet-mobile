// Mirrors afilianet-api's app/Support/Money/Currency.php EXPONENTS table.
// The backend isn't exposing this over the API, so we keep our own copy --
// it's small and changes rarely (adding a currency there requires a
// deliberate backend change anyway).
const CURRENCY_EXPONENTS: Record<string, number> = {
  USD: 2,
  MXN: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
};

const DEFAULT_EXPONENT = 2;

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? DEFAULT_EXPONENT;
}

/**
 * Formats a decimal-string money amount (as returned by afilianet-api's
 * Money::toDecimalString()) for display only. The backend already scales
 * the value to the currency's correct decimal places -- this just renders
 * it, explicitly pinning Intl.NumberFormat's fraction digits to the same
 * exponent table the backend uses so 0- and 3-decimal currencies (JPY,
 * BHD, ...) display correctly regardless of the JS engine's built-in ICU
 * currency data. Never use this for arithmetic -- combine amounts
 * server-side, not in the client, and never sum different currencies.
 */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  const digits = currencyExponent(currency);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}
