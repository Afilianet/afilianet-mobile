import { addMoney, currencyExponent, formatMoney } from "./money";

describe("currencyExponent", () => {
  it("returns 2 decimals for USD/MXN/EUR", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("MXN")).toBe(2);
    expect(currencyExponent("EUR")).toBe(2);
  });

  it("returns 0 decimals for JPY/KRW", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KRW")).toBe(0);
  });

  it("returns 3 decimals for BHD/KWD/OMR", () => {
    expect(currencyExponent("BHD")).toBe(3);
    expect(currencyExponent("KWD")).toBe(3);
    expect(currencyExponent("OMR")).toBe(3);
  });

  it("is case-insensitive", () => {
    expect(currencyExponent("jpy")).toBe(0);
  });

  it("falls back to 2 for an unlisted currency", () => {
    expect(currencyExponent("ZZZ")).toBe(2);
  });
});

describe("formatMoney", () => {
  it("formats a 2-decimal currency", () => {
    expect(formatMoney("1200", "MXN")).toContain("1,200.00");
  });

  it("formats a 0-decimal currency without a decimal point", () => {
    const formatted = formatMoney("500", "JPY");
    expect(formatted).not.toMatch(/\./);
    expect(formatted).toContain("500");
  });

  it("formats a 3-decimal currency", () => {
    expect(formatMoney("100.5", "BHD")).toContain("100.500");
  });

  it("pins fraction digits even when the input string has a different number of decimals", () => {
    expect(formatMoney("100", "BHD")).toContain("100.000");
    expect(formatMoney("100.1234", "MXN")).toContain("100.12");
  });

  it("returns the raw string for a non-numeric amount instead of throwing", () => {
    expect(formatMoney("not-a-number", "USD")).toBe("not-a-number");
  });

  it("formats a negative amount clearly", () => {
    expect(formatMoney("-50.00", "MXN")).toMatch(/-.*50\.00/);
  });
});

describe("addMoney", () => {
  it("adds two 2-decimal amounts without floating-point drift", () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 in IEEE754. Chosen so a
    // Number()-based implementation would visibly fail this exact case.
    expect(addMoney("100.10", "200.20", "MXN")).toBe("300.30");
  });

  it("adds two 0-decimal amounts", () => {
    expect(addMoney("500", "250", "JPY")).toBe("750");
  });

  it("adds two 3-decimal amounts", () => {
    expect(addMoney("100.500", "0.001", "BHD")).toBe("100.501");
  });

  it("adds a negative reversal to a positive balance", () => {
    expect(addMoney("100.00", "-30.00", "MXN")).toBe("70.00");
  });

  it("produces a negative total when debits exceed credits", () => {
    expect(addMoney("10.00", "-50.00", "MXN")).toBe("-40.00");
  });

  it("handles two negative amounts", () => {
    expect(addMoney("-10.00", "-5.00", "MXN")).toBe("-15.00");
  });
});
