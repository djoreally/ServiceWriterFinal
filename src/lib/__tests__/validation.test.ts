import {
  appointmentSchema,
  customerSchema,
  getFirstError,
  quoteSchema,
} from "@/lib/validation";

describe("validation", () => {
  describe("customerSchema", () => {
    it("accepts a valid customer", () => {
      const result = customerSchema.safeParse({
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "2155550100",
      });
      expect(result.success).toBe(true);
    });

    it("trims the name and rejects blanks", () => {
      expect(customerSchema.safeParse({ name: "   ", email: "j@x.com" }).success).toBe(false);
      const ok = customerSchema.safeParse({ name: "  Jane  ", email: "j@x.com" });
      expect(ok.success && ok.data.name).toBe("Jane");
    });

    it("rejects invalid emails", () => {
      expect(
        customerSchema.safeParse({ name: "Jane", email: "not-an-email" }).success,
      ).toBe(false);
    });
  });

  describe("appointmentSchema", () => {
    it("accepts a minimal appointment payload", () => {
      const result = appointmentSchema.safeParse({
        title: "Oil change",
        scheduled_date: "2026-09-23",
        scheduled_time: "09:00",
        duration_minutes: 60,
        status: "scheduled",
      });
      expect(result.success).toBe(true);
    });

    it("rejects durations below the 15-minute minimum", () => {
      const result = appointmentSchema.safeParse({
        title: "Oil change",
        scheduled_date: "2026-09-23",
        scheduled_time: "09:00",
        duration_minutes: 5,
        status: "scheduled",
      });
      expect(result.success).toBe(false);
      expect(getFirstError(result)).toContain("at least 15 minutes");
    });

    it("rejects unknown lifecycle statuses", () => {
      const result = appointmentSchema.safeParse({
        title: "Oil change",
        scheduled_date: "2026-09-23",
        scheduled_time: "09:00",
        duration_minutes: 60,
        status: "teleported",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("quoteSchema", () => {
    it("accepts a minimal quote payload", () => {
      const result = quoteSchema.safeParse({
        description: "Brake job",
        quote_date: "2026-09-23",
        status: "pending",
      });
      expect(result.success).toBe(true);
    });

    it("requires a description", () => {
      const result = quoteSchema.safeParse({
        description: "",
        quote_date: "2026-09-23",
        status: "pending",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getFirstError", () => {
    it("returns the first issue message", () => {
      const result = customerSchema.safeParse({ name: "", email: "bad" });
      const message = getFirstError(result);
      expect(typeof message).toBe("string");
      expect(message!.length).toBeGreaterThan(0);
    });

    it("returns null when parsing succeeded", () => {
      expect(getFirstError(customerSchema.safeParse({ name: "Jane" }))).toBeNull();
    });
  });
});
