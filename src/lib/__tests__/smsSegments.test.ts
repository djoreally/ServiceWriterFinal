import { countSmsSegments } from "../smsSegments";

describe("countSmsSegments", () => {
  it("counts a short GSM-7 message as one credit", () => {
    expect(countSmsSegments("Your appointment is confirmed.")).toBe(1);
  });

  it("counts exactly 160 GSM-7 characters as one credit", () => {
    expect(countSmsSegments("a".repeat(160))).toBe(1);
  });

  it("splits longer GSM-7 messages at 153 characters per segment", () => {
    expect(countSmsSegments("a".repeat(161))).toBe(2);
    expect(countSmsSegments("a".repeat(306))).toBe(2);
    expect(countSmsSegments("a".repeat(307))).toBe(3);
  });

  it("charges GSM-7 extended characters as two units", () => {
    expect(countSmsSegments("{".repeat(80))).toBe(1);
    expect(countSmsSegments("{".repeat(81))).toBe(2);
  });

  it("falls back to UCS-2 sizing for emoji and non-GSM text", () => {
    expect(countSmsSegments("🚗")).toBe(1);
    expect(countSmsSegments("é☃".repeat(40))).toBe(2);
  });

  it("treats an empty message as one credit", () => {
    expect(countSmsSegments("")).toBe(1);
  });
});
