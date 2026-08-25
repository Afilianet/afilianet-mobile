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
 * Parses a decimal-string money amount (as returned by afilianet-api's
 * Money::toDecimalString()) into integer minor units via BigInt -- no
 * float arithmetic anywhere. Lenient: silently truncates excess fraction
 * digits rather than rejecting them, since this is meant for values that
 * already came from the backend (always correctly scaled). For validating
 * RAW USER INPUT (e.g. a payout amount field), use parseAmountInput
 * instead, which rejects malformed/excess-decimal input rather than
 * truncating it.
 */
export function toMinorUnits(decimal: string, currency: string): bigint {
  const exponent = currencyExponent(currency);
  const scale = 10n ** BigInt(exponent);
  const trimmed = decimal.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const paddedFraction = (fractionPart + "0".repeat(exponent)).slice(0, exponent);
  const minor = BigInt(wholePart || "0") * scale + BigInt(paddedFraction || "0");
  return negative ? -minor : minor;
}

/**
 * Adds two decimal-string money amounts of the SAME currency, e.g. a
 * wallet's pending_balance + available_balance for a client-side "total".
 * Never uses float arithmetic (no `Number(a) + Number(b)`) -- both strings
 * are parsed into integer minor units via BigInt, added there, then
 * formatted back to a decimal string at the currency's own exponent. Never
 * call this across two different currencies; there is no such thing as a
 * combined balance.
 */
export function addMoney(a: string, b: string, currency: string): string {
  const exponent = currencyExponent(currency);
  const scale = 10n ** BigInt(exponent);
  const totalMinor = toMinorUnits(a, currency) + toMinorUnits(b, currency);
  const negative = totalMinor < 0n;
  const absMinor = negative ? -totalMinor : totalMinor;
  const wholePart = absMinor / scale;
  const fractionPart = (absMinor % scale).toString().padStart(exponent, "0");
  const formatted = exponent > 0 ? `${wholePart}.${fractionPart}` : `${wholePart}`;
  return negative ? `-${formatted}` : formatted;
}

const PLAIN_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export type ParsedAmount =
  | { valid: true; minorUnits: number; decimal: string }
  | { valid: false; error: string };

/**
 * Strictly validates a RAW amount string typed by a user (e.g. a payout
 * request field) -- unlike toMinorUnits, this rejects rather than silently
 * truncates. Rejects: negative values, zero, non-numeric/malformed input
 * (no leading +/-, no scientific notation, no thousands separators), and
 * more fraction digits than the currency's exponent allows. Never uses
 * Number()/float arithmetic for the actual conversion -- delegates to
 * toMinorUnits (BigInt) once the string shape is already known-safe.
 * The backend's own validation remains authoritative regardless; this is
 * purely a fast, friendly client-side pre-check.
 */
export function parseAmountInput(raw: string, currency: string): ParsedAmount {
  const trimmed = raw.trim();
  if (!PLAIN_DECIMAL_PATTERN.test(trimmed)) {
    return { valid: false, error: "Enter a valid amount." };
  }

  const exponent = currencyExponent(currency);
  const [, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > exponent) {
    return {
      valid: false,
      error:
        exponent === 0
          ? `${currency} doesn't use decimal places.`
          : `Enter up to ${exponent} decimal place${exponent === 1 ? "" : "s"}.`,
    };
  }

  const minorUnits = toMinorUnits(trimmed, currency);
  if (minorUnits <= 0n) {
    return { valid: false, error: "Enter an amount greater than zero." };
  }
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { valid: false, error: "That amount is too large." };
  }

  return { valid: true, minorUnits: Number(minorUnits), decimal: trimmed };
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
