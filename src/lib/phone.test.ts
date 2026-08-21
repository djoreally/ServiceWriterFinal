import {
  normalizePhoneToE164,
  isValidE164,
  formatPhoneDisplay,
  formatPhoneInput,
} from "@/lib/phone";

describe("normalizePhoneToE164", () => {
  it("converts 10-digit US number", () => {
    expect(normalizePhoneToE164("5551234567")).toBe("+15551234567");
  });

  it("converts formatted US number with parens and dash", () => {
    expect(normalizePhoneToE164("(555) 123-4567")).toBe("+15551234567");
  });

  it("converts formatted US number with dashes", () => {
    expect(normalizePhoneToE164("555-123-4567")).toBe("+15551234567");
  });

  it("converts 11-digit US number starting with 1", () => {
    expect(normalizePhoneToE164("15551234567")).toBe("+15551234567");
  });

  it("preserves already valid E.164", () => {
    expect(normalizePhoneToE164("+15551234567")).toBe("+15551234567");
  });

  it("preserves international numbers", () => {
    expect(normalizePhoneToE164("+447911123456")).toBe("+447911123456");
  });

  it("handles + with spaces", () => {
    expect(normalizePhoneToE164("+1 555 123 4567")).toBe("+15551234567");
  });

  it("returns empty for empty string", () => {
    expect(normalizePhoneToE164("")).toBe("");
  });

  it("returns empty for garbage input", () => {
    expect(normalizePhoneToE164("abc")).toBe("");
  });

  it("returns empty for too-short numbers", () => {
    expect(normalizePhoneToE164("12345")).toBe("");
  });

  it("returns empty for 7-digit local number (ambiguous)", () => {
    expect(normalizePhoneToE164("1234567")).toBe("");
  });
});

describe("isValidE164", () => {
  it("validates correct E.164", () => {
    expect(isValidE164("+15551234567")).toBe(true);
  });

  it("rejects missing +", () => {
    expect(isValidE164("15551234567")).toBe(false);
  });

  it("rejects too short", () => {
    expect(isValidE164("+1234")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidE164("+1abc1234567")).toBe(false);
  });
});

describe("formatPhoneDisplay", () => {
  it("formats US number as (XXX) XXX-XXXX", () => {
    expect(formatPhoneDisplay("+15551234567")).toBe("(555) 123-4567");
  });

  it("returns international numbers as-is", () => {
    expect(formatPhoneDisplay("+447911123456")).toBe("+447911123456");
  });

  it("returns empty for empty", () => {
    expect(formatPhoneDisplay("")).toBe("");
  });
});

describe("formatPhoneInput", () => {
  it("formats 3 digits as area code", () => {
    expect(formatPhoneInput("555")).toBe("555");
  });

  it("formats 4 digits with parens", () => {
    expect(formatPhoneInput("5551")).toBe("(555) 1");
  });

  it("formats 7 digits", () => {
    expect(formatPhoneInput("5551234")).toBe("(555) 123-4");
  });

  it("formats full 10 digits", () => {
    expect(formatPhoneInput("5551234567")).toBe("(555) 123-4567");
  });

  it("passes through international input starting with +", () => {
    expect(formatPhoneInput("+447911")).toBe("+447911");
  });

  it("returns empty for empty", () => {
    expect(formatPhoneInput("")).toBe("");
  });
});
