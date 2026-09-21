import {
  formatAmountInput,
  formatNumber,
  formatRupiah,
  formatSignedRupiah,
  isValidEntryAmount,
  parseAmount,
} from "../money";

describe("parseAmount", () => {
  it.each([
    ["50000", 50_000],
    ["50k", 50_000],
    ["50K", 50_000],
    ["50rb", 50_000],
    ["2m", 2_000_000],
    ["2jt", 2_000_000],
    ["1.5jt", 1_500_000],
    ["1,5jt", 1_500_000],
    ["1.15jt", 1_150_000],
    ["2.5k", 2_500],
    ["0,5rb", 500],
    ["50.000", 50_000],
    ["50,000", 50_000],
    ["1.500.000", 1_500_000],
    ["1,500,000", 1_500_000],
    ["Rp 25.000", 25_000],
    ["rp25000", 25_000],
    ["  75 rb ", 75_000],
    ["0", 0],
  ])("%s -> %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["1.5"], // no letter: dot is a thousands separator, group must be 3 digits
    ["12.34"],
    ["1.234,567"], // mixed separators
    ["1.2345k"], // 1234.5 is not a whole rupiah
    ["1.5.5jt"],
    ["-50k"],
    ["50kk"],
    ["5x"],
    ["1234.567"], // first group longer than 3 digits
    ["99999999999999999999"], // beyond safe integer
  ])("rejects %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("isValidEntryAmount", () => {
  it("requires a positive whole number", () => {
    expect(isValidEntryAmount(1)).toBe(true);
    expect(isValidEntryAmount(0)).toBe(false);
    expect(isValidEntryAmount(null)).toBe(false);
    expect(isValidEntryAmount(-5)).toBe(false);
  });
});

describe("formatting", () => {
  it("groups by language", () => {
    expect(formatNumber(1_500_000, "id")).toBe("1.500.000");
    expect(formatNumber(1_500_000, "en")).toBe("1,500,000");
    expect(formatNumber(999, "id")).toBe("999");
    expect(formatNumber(0, "en")).toBe("0");
  });

  it("formats rupiah with sign", () => {
    expect(formatRupiah(50_000, "id")).toBe("Rp 50.000");
    expect(formatRupiah(-50_000, "en")).toBe("-Rp 50,000");
    expect(formatSignedRupiah(50_000, "id")).toBe("+Rp 50.000");
    expect(formatSignedRupiah(-50_000, "id")).toBe("-Rp 50.000");
    expect(formatSignedRupiah(0, "id")).toBe("Rp 0");
  });
});

describe("formatAmountInput", () => {
  it("groups plain digits as the user types", () => {
    expect(formatAmountInput("1234", "id")).toBe("1.234");
    expect(formatAmountInput("1.2345", "id")).toBe("12.345");
    expect(formatAmountInput("1234567", "en")).toBe("1,234,567");
    expect(formatAmountInput("1,2345", "en")).toBe("12,345");
    expect(formatAmountInput("", "id")).toBe("");
    expect(formatAmountInput("007", "id")).toBe("7");
  });

  it("leaves shorthand in progress alone", () => {
    expect(formatAmountInput("50k", "id")).toBe("50k");
    expect(formatAmountInput("1,5", "id")).toBe("1,5"); // Indonesian decimal
    expect(formatAmountInput("1.5", "en")).toBe("1.5"); // English decimal
    expect(formatAmountInput("1.5", "id")).toBe("1.5"); // could become 1.5jt
    expect(formatAmountInput("1.", "id")).toBe("1.");
  });

  it("never turns typed shorthand into a different number", () => {
    // Simulate typing "1.5jt" keystroke by keystroke in Indonesian.
    let field = "";
    for (const ch of "1.5jt") field = formatAmountInput(field + ch, "id");
    expect(parseAmount(field)).toBe(1_500_000);
  });
});
