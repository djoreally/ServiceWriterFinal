import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("tire/detailing taxonomy migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260811182031_d269d407-9e4c-4947-8fbc-aee18fd067a2.sql"), "utf8");
  const removalSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260122120000_remove_service_templates.sql"), "utf8");
  const detailingSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260812150000_detailing_assessment_and_pricing.sql"), "utf8");

  it("recreates dropped taxonomy tables before altering or seeding them", () => {
    expect(sql.indexOf("CREATE TABLE IF NOT EXISTS public.service_categories")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("CREATE TABLE IF NOT EXISTS public.service_templates")).toBeGreaterThan(sql.indexOf("CREATE TABLE IF NOT EXISTS public.service_categories"));
    expect(sql.indexOf("ALTER TABLE public.service_categories")).toBeGreaterThan(sql.indexOf("CREATE TABLE IF NOT EXISTS public.service_templates"));
  });

  it("drops the dependent table before the legacy template tables", () => {
    expect(removalSql.indexOf("service_template_dependencies")).toBeLessThan(removalSql.indexOf("public.service_templates"));
  });

  it("makes category requirements explicit", () => {
    expect(sql).toContain("booking_requirements text[]");
    expect(sql).toContain("ARRAY['tire_fitment']");
    expect(sql).toContain("ARRAY['basic_vehicle','detailing_assessment']");
  });

  it("adds tenant-configurable detailing modifiers and assessment photo storage",()=>{
    expect(detailingSql).toContain("CREATE TABLE IF NOT EXISTS public.detailing_pricing_rules");
    expect(detailingSql).toContain("price_multiplier");
    expect(detailingSql).toContain("quote_required");
    expect(detailingSql).toContain("booking-assessment-photos");
  });
});
