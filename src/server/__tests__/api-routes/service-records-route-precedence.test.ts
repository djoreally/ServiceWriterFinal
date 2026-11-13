import fs from "node:fs";
import path from "node:path";

describe("service-records route precedence", () => {
  it("keeps an explicit GET route for page so service-records/[id] cannot shadow it", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app", "api", "v1", "service-records", "page", "route.ts"),
      "utf8",
    );
    expect(source).toContain('import { handle } from "hono/vercel"');
    expect(source).toContain('import { createHonoApp } from "@/server/hono/app"');
    expect(source).toContain("export const GET = handle(createHonoApp());");
  });

  it("keeps an explicit GET route for search-for-linking so service-records/[id] cannot shadow it", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app", "api", "v1", "service-records", "search-for-linking", "route.ts"),
      "utf8",
    );
    expect(source).toContain('import { handle } from "hono/vercel"');
    expect(source).toContain('import { createHonoApp } from "@/server/hono/app"');
    expect(source).toContain("export const GET = handle(createHonoApp());");
  });

  it("registers the Hono /search-for-linking handler before the /:id handler in vehicles.ts", () => {
    // Hono resolves overlaps in registration order across mounted routers:
    // vehiclesRouter mounts before workOrdersRouter in app.ts, so while
    // this handler lived on workOrdersRouter the vehicles :id registration
    // captured "search-for-linking" and failed UUID validation first.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "hono", "routes", "vehicles.ts"),
      "utf8",
    );
    const searchIdx = source.indexOf('vehiclesRouter.get("/v1/service-records/search-for-linking"');
    const idIdx = source.indexOf('vehiclesRouter.get("/v1/service-records/:id"');
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeLessThan(idIdx);
  });

  it("does not register /search-for-linking on workOrdersRouter, where it would sit behind the /:id handler", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "hono", "routes", "work-orders.ts"),
      "utf8",
    );
    expect(source).not.toContain('workOrdersRouter.get("/v1/service-records/search-for-linking"');
  });

  it("registers the Hono /page handler before the /:id handler in vehicles.ts", () => {
    // Hono resolves same-router overlaps in registration order: if the :id
    // registration comes first, it captures "page" and fails UUID validation
    // before the /page handler can run.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "hono", "routes", "vehicles.ts"),
      "utf8",
    );
    const pageIdx = source.indexOf('vehiclesRouter.get("/v1/service-records/page"');
    const idIdx = source.indexOf('vehiclesRouter.get("/v1/service-records/:id"');
    expect(pageIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(pageIdx).toBeLessThan(idIdx);
  });
});
