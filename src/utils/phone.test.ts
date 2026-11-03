import { formatPhoneForDisplay, maskPhone, normalizePhone, phoneCountry } from "./phone";

const MX = phoneCountry("MX");
const US = phoneCountry("US");
const GT = phoneCountry("GT");

describe("normalizePhone", () => {
  it.each([
    ["5512345678", "+525512345678"],
    ["55 1234 5678", "+525512345678"],
    ["(55) 1234-5678", "+525512345678"],
    ["+52 55 1234 5678", "+525512345678"],
    ["525512345678", "+525512345678"],
    ["00525512345678", "+525512345678"],
    ["+52 1 55 1234 5678", "+525512345678"],
    ["0445512345678", "+525512345678"],
  ])("normalizes the Mexican number %s to E.164", (input, expected) => {
    expect(normalizePhone(MX, input)).toBe(expected);
  });

  it.each(["", "551234567", "55123456789", "+1 555 123 4567", "55-1234-abcd", "0512345678"])(
    "rejects %p for Mexico instead of guessing",
    (input) => {
      expect(normalizePhone(MX, input)).toBeNull();
    },
  );

  it("normalizes other countries with their own dial code and length", () => {
    expect(normalizePhone(US, "(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone(GT, "1234 5678")).toBe("+50212345678");
    expect(normalizePhone(GT, "123456789")).toBeNull();
  });
});

describe("phone display", () => {
  it("formats for display and masks for 'we sent a code' copy", () => {
    expect(formatPhoneForDisplay("+525512345678")).toBe("+52 55 1234 5678");
    expect(formatPhoneForDisplay("+15551234567")).toBe("+1 555 123 4567");
    expect(maskPhone("+525512345678")).toBe("•••• 5678");
  });
});
