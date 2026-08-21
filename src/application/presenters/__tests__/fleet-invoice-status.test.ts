import { normalizeFleetInvoiceStatus } from "../fleet-invoice-status";

describe("normalizeFleetInvoiceStatus", () => {
  it.each([
    ["draft", "draft"],
    ["pending", "draft"],
    ["sent", "sent"],
    ["partial", "partial"],
    ["partially_paid", "partial"],
    ["paid", "paid"],
    ["void", "void"],
    ["viewed", "draft"],
    [null, "draft"],
  ])("normalizes %p to %s", (input, expected) => {
    expect(normalizeFleetInvoiceStatus(input)).toBe(expected);
  });
});
