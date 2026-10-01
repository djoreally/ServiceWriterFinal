import {
  escapeHtml,
  isSafeString,
  safePreview,
  sanitizeUrl,
  stripHtml,
} from "@/lib/security/sanitize";

describe("security/sanitize", () => {
  describe("escapeHtml", () => {
    it("escapes all HTML-significant characters", () => {
      expect(escapeHtml(`<script>alert("x&y")</script>`)).toBe(
        "&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;",
      );
      expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    it("leaves plain text untouched", () => {
      expect(escapeHtml("Oil change $89")).toBe("Oil change $89");
    });
  });

  describe("stripHtml", () => {
    it("removes tags but keeps text content", () => {
      expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    it("handles tag-like input without breaking", () => {
      expect(stripHtml("a < b")).toBe("a < b");
    });
  });

  describe("sanitizeUrl", () => {
    it("allows http/https links", () => {
      expect(sanitizeUrl("https://example.com/x")).toBe("https://example.com/x");
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    });

    it("allows mailto: and tel: links", () => {
      expect(sanitizeUrl("mailto:shop@example.com")).toBe("mailto:shop@example.com");
      expect(sanitizeUrl("tel:+12155550100")).toBe("tel:+12155550100");
    });

    it("blocks javascript: and data: XSS vectors", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
      expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBe("#");
      expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    });

    it("resolves relative URLs against the origin (allowed)", () => {
      expect(sanitizeUrl("/book/apex")).toBe("/book/apex");
    });

    it("returns # for unparseable input", () => {
      expect(sanitizeUrl("http://[::1")).toBe("#");
    });
  });

  describe("isSafeString", () => {
    it("rejects strings containing HTML or quote characters", () => {
      expect(isSafeString("<img>")).toBe(false);
      expect(isSafeString('say "hi"')).toBe(false);
      expect(isSafeString("it's")).toBe(false);
      expect(isSafeString("a`b")).toBe(false);
    });

    it("accepts plain strings", () => {
      expect(isSafeString("Brake pads")).toBe(true);
      expect(isSafeString("")).toBe(true);
    });
  });

  describe("safePreview", () => {
    it("strips HTML and truncates to maxLength", () => {
      expect(safePreview("<b>Hello world</b>", 5)).toBe("Hello");
    });

    it("defaults to a 200-character limit", () => {
      expect(safePreview("x".repeat(300))).toHaveLength(200);
    });
  });
});
