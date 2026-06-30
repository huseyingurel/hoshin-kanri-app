#!/usr/bin/env bash
# Full clone of the prod Supabase DB into the local Docker Postgres (hoshin-pg).
# Reads PROD_DB_URL from .env.prod (gitignored). Local-only; never commit dumps.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; source .env.prod; set +a

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "ERROR: PROD_DB_URL is empty. Put the Supabase direct connection string in .env.prod" >&2
  exit 1
fi

LOCAL_URL="postgresql://hoshin:hoshin@localhost:5433/hoshin"
DUMP_FILE="prod.dump"

echo "==> Dumping prod (public schema, data + structure)..."
# Custom format, public schema only (skips Supabase-internal auth/storage schemas),
# strip ownership/grants since local roles differ.
pg_dump "$PROD_DB_URL" \
  --schema=public \
  --no-owner --no-privileges --no-comments \
  --format=custom \
  --file="$DUMP_FILE"

echo "==> Resetting local public schema..."
psql "$LOCAL_URL" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

echo "==> Restoring into local..."
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$LOCAL_URL" "$DUMP_FILE" || true   # tolerate benign 'already exists' noise

echo "==> Row counts in local clone:"
psql "$LOCAL_URL" -c "SELECT relname AS table, n_live_tup AS rows
  FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

echo "==> Done. Dump left at $DUMP_FILE (gitignored). Delete it when finished."
