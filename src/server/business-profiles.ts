/**
 * business_profiles write helper.
 *
 * The table is keyed by workspace_id (UNIQUE) after the Step 3 platform
 * translation, so "upsert" here is update-then-insert-if-missing against
 * that key. The insert path can fail on NOT NULL columns whose defaults
 * live only in production; that failure is thrown (loud) so a save never
 * reports success while writing zero rows.
 *
 * Callers resolve the workspace server-side from the auth token and pass
 * the workspace id — never a user id.
 *
 * Returns the saved row. Throws when the write cannot be verified.
 */
export async function upsertBusinessProfile(
  db: { from: (table: string) => any },
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data: updated, error: updateError } = await db
    .from("business_profiles")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return updated as Record<string, unknown>;

  const { data: inserted, error: insertError } = await db
    .from("business_profiles")
    .insert({ workspace_id: workspaceId, ...patch })
    .select()
    .single();
  if (insertError) throw insertError;
  if (!inserted) throw new Error("Settings could not be saved.");
  return inserted as Record<string, unknown>;
}
