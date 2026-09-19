import { z } from "zod";
import { errorResponse, json } from "@/server/api";
import { createSupabaseServerClient } from "@/lib/supabase";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const querySchema = z.object({
  section: z.enum(["profile", "catalog", "packages", "slots", "blocked_dates", "settings"]).default("profile"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const bookingSlugAliases: Readonly<Record<string, string>> = {
  moms: "momsoilchange",
  "moms-mobile-oil-change": "momsoilchange",
};

type RpcRow = Record<string, unknown>;
type Requirement = "basic_vehicle" | "oil_fitment" | "tire_fitment" | "tire_quantity" | "detailing_assessment";

function unavailable() { return new Error("public_booking_unavailable"); }

function canonicalBookingSlug(slug: string): string {
  return bookingSlugAliases[slug.toLowerCase()] ?? slug;
}

function normalizedRequirements(row: RpcRow): Requirement[] {
  const requirements = new Set<Requirement>(["basic_vehicle"]);
  const stored = Array.isArray(row.booking_requirements) ? row.booking_requirements : [];
  for (const requirement of stored) {
    if (["basic_vehicle", "oil_fitment", "tire_fitment", "tire_quantity", "detailing_assessment"].includes(String(requirement))) requirements.add(requirement as Requirement);
  }
  const identity = [row.category_id, row.category, row.name].filter((value): value is string => typeof value === "string").join(" ").toLowerCase().replaceAll("_", " ");
  if (/\b(oil|lube|lubrication|oil fluids?|fluid service)\b/.test(identity)) requirements.add("oil_fitment");
  if (/\b(tire|tires|tyre|wheel|wheels|tpms|rotation)\b/.test(identity)) requirements.add("tire_fitment");
  if (/\b(detail|detailing|wash|ceramic|coating|wax|polish|interior|exterior)\b/.test(identity)) requirements.add("detailing_assessment");
  return Array.from(requirements);
}

function normalizeCatalog(rows: RpcRow[]): RpcRow[] {
  return rows.map((row) => ({ ...row, booking_requirements: normalizedRequirements(row) }));
}

async function profileForSlug(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, slug: string) {
  const { data, error } = await supabase.rpc("get_public_booking_profile_v3" as never, { booking_slug_param: slug });
  if (error || !Array.isArray(data) || data.length === 0) throw unavailable();
  return data[0] as RpcRow;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = canonicalBookingSlug(slugSchema.parse(rawSlug));
    const url = new URL(request.url);
    const query = querySchema.parse({ section: url.searchParams.get("section") ?? undefined, date: url.searchParams.get("date") ?? undefined });
    const supabase = await createSupabaseServerClient();
    const profile = await profileForSlug(supabase, slug);

    if (query.section === "profile") return json({ data: profile }, { headers: { "Cache-Control": "no-store" } });

    if (query.section === "catalog") {
      const v2 = await supabase.rpc("get_public_service_catalog_v3" as never, { p_booking_slug: slug } as never);
      if (!v2.error && Array.isArray(v2.data)) return json({ data: normalizeCatalog(v2.data as RpcRow[]) }, { headers: { "Cache-Control": "no-store" } });
      throw unavailable();
    }

    if (query.section === "packages") {
      const { data, error } = await supabase.rpc("get_public_service_packages_v2" as never, { p_booking_slug: slug } as never);
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "slots") {
      if (!query.date) return json({ error: { code: "invalid_date", message: "date is required for slots" } }, { status: 400 });
      const { data, error } = await supabase.rpc("get_public_booked_slots_v2" as never, { p_booking_slug: slug, p_booking_date: query.date } as never);
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "blocked_dates") {
      const db = supabase as any;
      const { data, error } = await db.rpc("get_public_blocked_dates_v3", { p_booking_slug: slug });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await supabase.rpc("get_public_booking_settings_v2" as never, { p_booking_slug: slug } as never);
    if (error) throw unavailable();
    return json({ data: Array.isArray(data) ? data[0] ?? null : data ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_public_booking_request", message: "Invalid public booking request" } }, { status: 400 });
    if (error instanceof Error && error.message === "public_booking_unavailable") return json({ error: { code: "public_booking_unavailable", message: "This booking page is not currently available." } }, { status: 503 });
    return errorResponse(error);
  }
}
