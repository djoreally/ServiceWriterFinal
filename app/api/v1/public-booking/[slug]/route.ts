import { z } from "zod";
import { errorResponse, json } from "@/server/api";
import { createSupabaseServerClient } from "@/lib/supabase";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const querySchema = z.object({
  section: z.enum(["profile", "catalog", "packages", "slots", "blocked_dates", "settings"]).default("profile"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type RpcRow = Record<string, unknown>;

function unavailable() {
  return new Error("public_booking_unavailable");
}

async function profileForSlug(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, slug: string) {
  const { data, error } = await supabase.rpc("get_public_booking_profile_v2", { booking_slug_param: slug });
  if (error || !Array.isArray(data) || data.length === 0) throw unavailable();
  return data[0] as RpcRow;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = slugSchema.parse(rawSlug);
    const url = new URL(request.url);
    const query = querySchema.parse({
      section: url.searchParams.get("section") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
    });
    const supabase = await createSupabaseServerClient();
    const profile = await profileForSlug(supabase, slug);
    const businessUserId = z.string().uuid().parse(profile.user_id);

    if (query.section === "profile") return json({ data: profile }, { headers: { "Cache-Control": "no-store" } });

    if (query.section === "catalog") {
      const v2 = await supabase.rpc("get_public_service_catalog_v2", {
        p_business_user_id: businessUserId,
        p_booking_context_id: null,
      });
      if (!v2.error && Array.isArray(v2.data)) return json({ data: v2.data }, { headers: { "Cache-Control": "no-store" } });
      const v1 = await supabase.rpc("get_public_service_catalog", { business_user_id: businessUserId });
      if (v1.error || !Array.isArray(v1.data)) throw unavailable();
      return json({ data: v1.data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "packages") {
      const { data, error } = await supabase.rpc("get_public_service_packages", { business_user_id: businessUserId });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "slots") {
      if (!query.date) return json({ error: { code: "invalid_date", message: "date is required for slots" } }, { status: 400 });
      const { data, error } = await supabase.rpc("get_booked_slots", { business_user_id: businessUserId, booking_date: query.date });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "blocked_dates") {
      const { data, error } = await supabase.rpc("get_public_blocked_dates", {
        p_business_user_id: businessUserId,
        p_customer_account_id: null,
      });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await supabase.rpc("get_public_booking_settings", { p_business_user_id: businessUserId });
    if (error) throw unavailable();
    return json({ data: Array.isArray(data) ? data[0] ?? null : data ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_public_booking_request", message: "Invalid public booking request" } }, { status: 400 });
    if (error instanceof Error && error.message === "public_booking_unavailable") {
      return json({ error: { code: "public_booking_unavailable", message: "This booking page is not currently available." } }, { status: 503 });
    }
    return errorResponse(error);
  }
}
