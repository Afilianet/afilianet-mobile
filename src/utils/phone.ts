/**
 * Phone numbers travel to the API only in E.164 ("+5215512345678" is NOT
 * valid; Mexico is "+52" followed by exactly 10 national digits). The
 * national-number lengths below are each country's own fixed plan; anything
 * else is rejected locally instead of being guessed at.
 */
export interface PhoneCountry {
  iso: string;
  name: string;
  dialCode: string;
  nationalLength: number;
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "MX", name: "México", dialCode: "52", nationalLength: 10 },
  { iso: "US", name: "Estados Unidos", dialCode: "1", nationalLength: 10 },
  { iso: "CA", name: "Canadá", dialCode: "1", nationalLength: 10 },
  { iso: "GT", name: "Guatemala", dialCode: "502", nationalLength: 8 },
  { iso: "SV", name: "El Salvador", dialCode: "503", nationalLength: 8 },
  { iso: "HN", name: "Honduras", dialCode: "504", nationalLength: 8 },
  { iso: "CO", name: "Colombia", dialCode: "57", nationalLength: 10 },
  { iso: "ES", name: "España", dialCode: "34", nationalLength: 9 },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

export function phoneCountry(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) ?? DEFAULT_PHONE_COUNTRY;
}

/**
 * National digits as typed (spaces, dashes, parentheses allowed) -> E.164,
 * or null when it is not a complete number for that country. Accepts the
 * user pasting the country code back in, and Mexico's legacy prefixes
 * ("044"/"045" domestic, "1" after +52) that still circulate on contact cards.
 */
export function normalizePhone(country: PhoneCountry, input: string): string | null {
  let digits = input.replace(/[\s().-]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith(`+${country.dialCode}`)) return null;
    digits = digits.slice(country.dialCode.length + 1);
  } else if (digits.startsWith("00" + country.dialCode) && digits.length > country.nationalLength) {
    digits = digits.slice(country.dialCode.length + 2);
  } else if (digits.length === country.nationalLength + country.dialCode.length && digits.startsWith(country.dialCode)) {
    digits = digits.slice(country.dialCode.length);
  }
  if (country.iso === "MX") {
    if (digits.length === 13 && (digits.startsWith("044") || digits.startsWith("045"))) digits = digits.slice(3);
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  }
  if (!/^\d+$/.test(digits) || digits.length !== country.nationalLength || digits.startsWith("0")) return null;
  return `+${country.dialCode}${digits}`;
}

/** "+525512345678" -> "+52 55 1234 5678" for display only; never sent to the API. */
export function formatPhoneForDisplay(e164: string): string {
  const mexico = /^\+52(\d{2})(\d{4})(\d{4})$/.exec(e164);
  if (mexico) return `+52 ${mexico[1]} ${mexico[2]} ${mexico[3]}`;
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (nanp) return `+1 ${nanp[1]} ${nanp[2]} ${nanp[3]}`;
  return e164;
}

/** Masks all but the last 4 digits, for "we sent a code to ..." copy. */
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}
