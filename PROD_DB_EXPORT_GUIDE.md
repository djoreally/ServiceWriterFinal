# Production Database Export Guide — Service Writer

**Purpose:** Produce the authoritative production schema dump so the 245
reverse-engineered migrations (`supabase/migrations/20261010*_reverse_engineered_*.sql`,
generated 2026-10-10) can be verified — and replaced where they differ — before
anything is applied to production.

> This file is intentionally uncommitted. The reverse-engineered migrations are
> also uncommitted. Nothing here touches production until you say so.

## 1. Get the production connection string

Supabase Dashboard path:

1. Go to https://supabase.com/dashboard/project/rjfbrfognxqkyhdrpibx
2. Left sidebar → **Project Settings** (gear icon) → **Database**
3. Scroll to **Connection string** → copy the **URI** (it starts with
   `postgresql://postgres:[YOUR-PASSWORD]@...`)
4. Replace `[YOUR-PASSWORD]` with the database password
   (Project Settings → Database → **Database password** → Reset if unknown)

## 2. Dump the production schema (schema only, no data)

You need the Supabase CLI once. Either:

```bash
npm install -g supabase
```

or use it without installing:

```bash
npx supabase --version
```

Then, from anywhere (do **not** run this inside `~/workspace/sw-final` — keep the
dump out of the repo):

```bash
cd /tmp
supabase db dump \
  --db-url "postgresql://postgres:YOUR-PASSWORD@db.rjfbrfognxqkyhdrpibx.supabase.co:5432/postgres" \
  -f prod_schema.sql
```

This writes `/tmp/prod_schema.sql` — the full `public` schema (tables, functions,
indexes, triggers, RLS policies). **Schema only; no row data leaves production.**

Optional but recommended — dump RLS policies and roles explicitly (they are in
the schema dump, but a second file makes diffing easier):

```bash
supabase db dump \
  --db-url "postgresql://postgres:YOUR-PASSWORD@db.rjfbrfognxqkyhdrpibx.supabase.co:5432/postgres" \
  --role-only -f prod_roles.sql
```

## 3. Diff the dump against the repo's migrations

### 3a. What the repo claims vs. what production has (tables)

```bash
# tables in production
grep -oiE "CREATE TABLE (IF NOT EXISTS )?public\.[a-z_0-9]+" /tmp/prod_schema.sql \
  | awk '{print $NF}' | sed 's/public\.//' | sort -u > /tmp/prod_tables.txt

# tables the repo's migrations create
grep -rhoiE "CREATE TABLE (IF NOT EXISTS )?public\.[a-z_0-9]+" \
  ~/workspace/sw-final/supabase/migrations/*.sql \
  | awk '{print $NF}' | sed 's/public\.//' | sort -u > /tmp/repo_tables.txt

# in production but never created by any repo migration (the off-books set)
comm -23 /tmp/prod_tables.txt /tmp/repo_tables.txt > /tmp/offbooks_tables.txt
wc -l /tmp/offbooks_tables.txt
```

Expect `/tmp/offbooks_tables.txt` to match the 159 tables the reverse-engineered
migrations cover. Any table in the dump that is **not** covered by a
`20261010*_reverse_engineered_*.sql` file is a gap — tell Muse and it will write
the missing migration.

### 3b. Functions / RPCs

```bash
grep -oiE "CREATE (OR REPLACE )?FUNCTION public\.[a-z_0-9]+" /tmp/prod_schema.sql \
  | awk '{print $NF}' | sed 's/public\.//' | sort -u > /tmp/prod_funcs.txt

grep -rhoiE "CREATE (OR REPLACE )?FUNCTION public\.[a-z_0-9]+" \
  ~/workspace/sw-final/supabase/migrations/*.sql \
  | awk '{print $NF}' | sed 's/public\.//' | sort -u > /tmp/repo_funcs.txt

comm -23 /tmp/prod_funcs.txt /tmp/repo_funcs.txt > /tmp/offbooks_funcs.txt
```

### 3c. Verify one reverse-engineered table against the dump (spot check)

```bash
# example: email_settings
grep -A40 "CREATE TABLE public.email_settings" /tmp/prod_schema.sql | head -45
```

Compare column names, types, nullability, and defaults against
`supabase/migrations/20261010000020_reverse_engineered_email_settings.sql`.
Known approximations in the reverse-engineered files (fix from the dump):

| Reverse-engineered guess | Check in dump |
|---|---|
| `text` for every string column | real type may be `varchar(n)`, `uuid`, `date`, `time` |
| `numeric` for every number column | real type may be `integer`, `bigint`, `double precision` |
| `timestamptz` for `*_at` columns | some may be `date` or `timestamp` |
| `uuid DEFAULT gen_random_uuid()` PKs | confirm PK type + default |
| RLS policies | dump has the real policies — **copy them verbatim**, delete the guessed ones |
| FK constraints | names/columns should match; add any missing |

### 3d. Replace stub RPC bodies with production definitions

```bash
# example: encrypt_smtp_password
grep -B2 -A25 "CREATE OR REPLACE FUNCTION public.encrypt_smtp_password" /tmp/prod_schema.sql
```

Copy the production body into the corresponding
`20261010*_reverse_engineered_rpc_*.sql` file, replacing the stub. The stub is
deliberately installed **only if the function does not already exist**
(`IF NOT EXISTS` on `pg_proc`), so applying the migrations to production today
changes nothing — but the files should still carry the real definitions for a
fresh rebuild.

## 4. When the diff is clean

1. For every reverse-engineered file, either confirm it matches the dump or
   replace its contents with the production definition (keeping the
   `IF NOT EXISTS` / non-clobbering guards).
2. Remove the `-- REVERSE-ENGINEERED` header once a file is verified, or keep it
   with a `-- VERIFIED against prod dump YYYY-MM-DD` note.
3. Then — and only then — the migrations are safe to apply to a fresh database,
   and safe to commit.

## 5. Safety notes

- `supabase db dump` is **read-only** against production. It cannot modify data.
- Never paste the connection string (it contains the password) into chat, a file
  in the repo, or a widget. Use it only in the terminal command above.
- The reverse-engineered migrations are idempotent by construction
  (`CREATE TABLE IF NOT EXISTS`, policy/FK `DO`-block guards, RPC stubs gated on
  `pg_proc`). If applied to production as-is, they create nothing that already
  exists — but the RPC stubs and guessed column types are **not** production
  truth until step 3 is done.
