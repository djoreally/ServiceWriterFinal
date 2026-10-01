import { errorCode, errorMessage } from "@/lib/error-message";

describe("error-message", () => {
  describe("errorMessage", () => {
    it("returns the fallback for nullish errors", () => {
      expect(errorMessage(null)).toBe("Unexpected error");
      expect(errorMessage(undefined)).toBe("Unexpected error");
      expect(errorMessage(null, "Custom fallback")).toBe("Custom fallback");
    });

    it("passes strings through untouched", () => {
      expect(errorMessage("plain string")).toBe("plain string");
    });

    it("reads Error.message", () => {
      expect(errorMessage(new Error("boom"))).toBe("boom");
    });

    it("unpacks Supabase/PostgREST-shaped plain objects", () => {
      expect(
        errorMessage({ message: "duplicate key", details: "Key (id)=(1) exists" }),
      ).toBe("duplicate key — Key (id)=(1) exists");
    });

    it("appends the error code when present", () => {
      expect(errorMessage({ message: "nope", code: "23505" })).toBe("nope (23505)");
    });

    it("skips blank parts", () => {
      expect(errorMessage({ message: "  ", hint: "check the id" })).toBe("check the id");
    });

    it("serializes unknown object shapes instead of printing [object Object]", () => {
      expect(errorMessage({ weird: 42 })).toBe('{"weird":42}');
    });

    it("falls back for empty objects and unserializable values", () => {
      expect(errorMessage({})).toBe("Unexpected error");
    });
  });

  describe("errorCode", () => {
    it("reads the code from plain objects", () => {
      expect(errorCode({ code: "23505" })).toBe("23505");
      expect(errorCode(new Error("x"))).toBeUndefined();
    });

    it("returns undefined for non-objects or non-string codes", () => {
      expect(errorCode(null)).toBeUndefined();
      expect(errorCode("23505")).toBeUndefined();
      expect(errorCode({ code: 42 })).toBeUndefined();
    });
  });
});
