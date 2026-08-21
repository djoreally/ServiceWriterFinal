import fs from "node:fs";
import path from "node:path";

describe("public-booking.query purity", () => {
  it("does not contain mutation primitives", () => {
    const file = path.resolve(process.cwd(), "src/application/queries/public-booking.query.ts");
    const source = fs.readFileSync(file, "utf8");

    const forbidden = [".insert(", ".update(", ".upsert(", ".delete("];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });
});
