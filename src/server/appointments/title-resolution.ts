/**
 * Server-side inputs for the B2 title composition (T-1).
 *
 * The composition itself is pure (`@/lib/appointment-title`); these are
 * the two lookups a route needs before it can compose: the workspace
 * timezone the schedule segment renders in, and each job's primary
 * service name — the first service line's description, in line order,
 * which is the name the job was booked and invoiced under.
 */

/** The workspace's timezone, "UTC" when the workspace carries none. */
export async function resolveWorkspaceTimezone(
  supabase: any,
  workspaceId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("timezone")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as { timezone?: string } | null)?.timezone || "UTC";
}

/**
 * Primary service name per appointment: the first `appointment_items`
 * description (sort_order, then creation order) for each id.
 *
 * Best-effort by design: the name feeds a display subtitle, and the
 * composition already falls back to the booking metadata when a name is
 * missing — a failed lookup must never fail the job response itself.
 */
export async function resolvePrimaryServiceNames(
  supabase: any,
  workspaceId: string,
  appointmentIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(appointmentIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return names;
  try {
    const { data, error } = await supabase
      .from("appointment_items")
      .select("appointment_id,description,sort_order,created_at")
      .eq("workspace_id", workspaceId)
      .in("appointment_id", ids)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    for (const item of (data ?? []) as Array<{ appointment_id?: unknown; description?: unknown }>) {
      const appointmentId = typeof item.appointment_id === "string" ? item.appointment_id : null;
      const description = typeof item.description === "string" ? item.description.trim() : "";
      if (appointmentId && description && !names.has(appointmentId)) {
        names.set(appointmentId, description);
      }
    }
  } catch (error) {
    console.error("[B2] primary service lookup failed", error);
  }
  return names;
}
