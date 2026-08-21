import { serializeJsonLd } from "./jsonLd";

describe("serializeJsonLd", () => {
  it("preserves JSON data while escaping HTML parser-sensitive characters", () => {
    const serialized = serializeJsonLd({
      name: "Provider </script><script>alert(1)</script>",
      notes: "A & B > C",
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(serialized).toContain("\\u0026");
    expect(JSON.parse(serialized)).toEqual({
      name: "Provider </script><script>alert(1)</script>",
      notes: "A & B > C",
    });
  });

  it("escapes unicode line separators that can break JavaScript parsers", () => {
    const serialized = serializeJsonLd({ value: "first\u2028second\u2029third" });

    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(JSON.parse(serialized)).toEqual({ value: "first\u2028second\u2029third" });
  });
});
