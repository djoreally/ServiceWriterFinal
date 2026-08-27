# Vercel Production Supabase Target Findings

Date: 2026-08-27

The canonical Vercel project `servicewriter.xyx` serves `servicewriter.xyz` and has Production environment entries for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Secret values were not opened or recorded.

The Vercel UI confirms that the production Supabase variables exist, but it does not expose the target project reference in the rendered variable list without opening values. The currently connected Supabase project `shlnvgqgygapwpzjdrhr` remains schema-incompatible, so no production DDL was executed against it.

Required next action: obtain the non-secret Supabase project reference by inspecting the production `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` hostname through an approved secure configuration export or by opening the value only in a protected operator workflow; never commit or echo keys.
