import { errorResponse, json, requireUser } from "@/server/api";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const [{ data: memberships, error: membershipError }, { data: customerLinks, error: customerError }] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("workspace_id, role, is_active, workspaces(id, name, kind, timezone)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("customer_users")
        .select("workspace_id, customer_id, is_primary, customers(id, first_name, last_name, company_name)")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false }),
    ]);
    if (membershipError) throw membershipError;
    if (customerError) throw customerError;
    return json({
      data: {
        user: { id: user.id, email: user.email ?? null },
        memberships: memberships ?? [],
        customer_links: customerLinks ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
