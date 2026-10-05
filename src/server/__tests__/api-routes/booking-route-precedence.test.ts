import fs from "node:fs";
import path from "node:path";

describe("public booking route precedence", () => {
  const readRoute = (name: string) =>
    fs.readFileSync(
      path.join(process.cwd(), "app", "api", "v1", "appointments", name, "route.ts"),
      "utf8",
    );

  it.each(["booking-progress", "booking-recovered", "booking-rpc"])(
    "keeps an explicit POST route for %s so appointments/[id] cannot shadow it",
    (name) => {
      const source = readRoute(name);
      expect(source).toContain('import { handle } from "hono/vercel"');
      expect(source).toContain('import { createHonoApp } from "@/server/hono/app"');
      expect(source).toContain("export const POST = handle(createHonoApp());");
    },
  );
});
