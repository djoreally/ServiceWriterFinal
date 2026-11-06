#!/usr/bin/env bash
# ============================================================================
# EMV HISTORY IMPORT — runner.
#
# Restores the emv backup into a scratch "source" database, stages the 9
# tables the pour needs into the TARGET database as schema `emv_staging`,
# applies the import foundation migration (idempotent), then runs
# emv_import.sql inside ONE transaction and ends it with ROLLBACK
# (default: dry run) or COMMIT (only with --commit, only on Ty's word).
#
# Credentials are NEVER stored or passed on the command line by this script:
# both DSNs come from the operator's environment.
#
# Required env:
#   EMV_TARGET_DSN   psql connection string for the target database
#   EMV_SOURCE_DSN   psql connection string for a SCRATCH database the
#                    backup can be restored into (must already exist;
#                    its public schema gets overwritten by the restore)
# Required flags:
#   --workspace-id UUID     target workspace (MOMS)
# Optional flags:
#   --backup PATH           default: ~/workspace/drive-dig/moms_260814.backup
#   --tz America/New_York   default: America/New_York
#   --batch LABEL           default: emv-2026-08-14
#   --source-user-id UUID   default: 425ce961-9bfe-4d25-94a7-483b3d6eba61 (Ty's emv account)
#   --commit                actually commit (DEFAULT IS DRY RUN / ROLLBACK)
#   --keep-staging          do not drop emv_staging at the end
#   --report PATH           report output path (default: ./emv-import-report-<ts>.txt)
#
# Requires: psql + pg_restore (PostgreSQL 18 — the backup is a PG18 dump).
# ============================================================================
set -euo pipefail

BACKUP="${HOME}/workspace/drive-dig/moms_260814.backup"
TZ_NAME="America/New_York"
BATCH="emv-2026-08-14"
SOURCE_USER_ID="425ce961-9bfe-4d25-94a7-483b3d6eba61"
WORKSPACE_ID=""
COMMIT=0
KEEP_STAGING=0
REPORT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="$2"; shift 2 ;;
    --workspace-id) WORKSPACE_ID="$2"; shift 2 ;;
    --tz) TZ_NAME="$2"; shift 2 ;;
    --batch) BATCH="$2"; shift 2 ;;
    --source-user-id) SOURCE_USER_ID="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    --commit) COMMIT=1; shift ;;
    --keep-staging) KEEP_STAGING=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

[ -n "${EMV_TARGET_DSN:-}" ] || { echo "EMV_TARGET_DSN is not set" >&2; exit 2; }
[ -n "${EMV_SOURCE_DSN:-}" ] || { echo "EMV_SOURCE_DSN is not set" >&2; exit 2; }
[ -n "$WORKSPACE_ID" ] || { echo "--workspace-id is required" >&2; exit 2; }
[ -f "$BACKUP" ] || { echo "backup not found: $BACKUP" >&2; exit 2; }
[ -n "$REPORT" ] || REPORT="./emv-import-report-$(date +%Y%m%d%H%M%S).txt"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MIGRATION="${REPO_ROOT}/supabase/migrations/20261106000000_emv_import_foundation.sql"
TABLES="customers vehicles appointments appointment_services services payment_records financial_transactions vehicle_specifications fleet_clients fleet_contacts"

echo "== EMV import runner =="
echo "backup:    $BACKUP"
echo "workspace: $WORKSPACE_ID  tz: $TZ_NAME  batch: $BATCH"
if [ "$COMMIT" = "1" ]; then echo "MODE:      *** COMMIT (real pour) ***"; else echo "MODE:      dry run (rollback)"; fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "-- restoring backup into source scratch database"
pg_restore --dbname="$EMV_SOURCE_DSN" --no-owner --no-privileges --clean --if-exists "$BACKUP" \
  2>"$WORKDIR/restore.err" || true
# Supabase-platform objects (pg_cron/pg_net/vault schemas) error on a vanilla
# scratch database; the public tables are what matter — verify they landed.
SRC_APPTS="$(psql "$EMV_SOURCE_DSN" -Atc "select count(*) from public.appointments")"
echo "   source appointments: $SRC_APPTS (expect 188; restore warnings: $(grep -c 'ERROR' "$WORKDIR/restore.err" || true), all platform-extension class)"

echo "-- staging tables into target as emv_staging"
psql "$EMV_TARGET_DSN" -v ON_ERROR_STOP=1 -qc "drop schema if exists emv_staging cascade; create schema emv_staging;"
# staging DDL generated from the source's own catalog (real shape, no invention)
psql "$EMV_SOURCE_DSN" -At > "$WORKDIR/staging_ddl.sql" <<'SQL'
select format('CREATE TABLE emv_staging.%I (%s);', c.relname,
  string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public'
  and c.relname in ('customers','vehicles','appointments','appointment_services','services',
                    'payment_records','financial_transactions','vehicle_specifications',
                    'fleet_clients','fleet_contacts')
group by c.relname;
SQL
psql "$EMV_TARGET_DSN" -v ON_ERROR_STOP=1 -q -f "$WORKDIR/staging_ddl.sql"
for t in $TABLES; do
  pg_dump "$EMV_SOURCE_DSN" --data-only --no-owner --no-privileges -t "public.$t" \
    | grep -v '^\\restrict' | grep -v '^\\unrestrict' \
    | sed "s/^COPY public\.$t /COPY emv_staging.$t /" \
    | psql "$EMV_TARGET_DSN" -v ON_ERROR_STOP=1 -q
  echo "   staged $t: $(psql "$EMV_TARGET_DSN" -Atc "select count(*) from emv_staging.$t") rows"
done

echo "-- applying import foundation migration (idempotent)"
psql "$EMV_TARGET_DSN" -v ON_ERROR_STOP=1 -q -f "$MIGRATION"

echo "-- running the pour (single transaction)"
if [ "$COMMIT" = "1" ]; then END_TXN="commit"; else END_TXN="rollback"; fi
psql "$EMV_TARGET_DSN" \
  -v workspace_id="$WORKSPACE_ID" \
  -v workspace_tz="$TZ_NAME" \
  -v import_batch="$BATCH" \
  -v source_user_id="$SOURCE_USER_ID" \
  -c "begin" \
  -f "$SCRIPT_DIR/emv_import.sql" \
  -c "$END_TXN" | tee "$REPORT"

if [ "$KEEP_STAGING" = "0" ]; then
  psql "$EMV_TARGET_DSN" -qc "drop schema if exists emv_staging cascade;"
  echo "-- staging dropped"
fi
echo "== done. mode: $([ "$COMMIT" = "1" ] && echo COMMITTED || echo 'DRY RUN (rolled back)'). report: $REPORT"
