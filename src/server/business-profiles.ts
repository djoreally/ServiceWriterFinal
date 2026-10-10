/**
 * business_profiles write helper.
 *
 * The table is keyed by user_id but has no unique constraint on it in the
 * repo's migrations, so there is no upsert conflict target — "upsert" here is
 * update-then-insert-if-missing. The insert path can fail on NOT NULL columns
 * whose defaults live only in production; that failure is thrown (loud) so a
 * save never reports success while writing zero rows.
 *
 * Returns the saved row. Throws when the write cannot be verified.
 */
export async function upsertBusinessProfile(
  db: { from: (table: string) => any },
  userId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data: updated, error: updateError } = await db
    .from("business_profiles")
    .update(patch)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return updated as Record<string, unknown>;

  const { data: inserted, error: insertError } = await db
    .from("business_profiles")
    .insert({ user_id: userId, ...patch })
    .select()
    .single();
  if (insertError) throw insertError;
  if (!inserted) throw new Error("Settings could not be saved.");
  return inserted as Record<string, unknown>;
}
