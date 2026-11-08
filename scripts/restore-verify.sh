#!/usr/bin/env bash
set -euo pipefail
# Restores a gzipped SQL dump into a *scratch* database and runs smoke checks.
# Usage: ./scripts/restore-verify.sh backups/versys-....sql.gz
DUMP="${1:?dump path required}"
SCRATCH="${DATABASE_NAME:-versys}_restore_verify"

: "${DATABASE_HOST:?}"
: "${DATABASE_USER:?}"

export PGPASSWORD="${DATABASE_PASSWORD:-}"
PSQL=(psql -h "$DATABASE_HOST" -p "${DATABASE_PORT:-5432}" -U "$DATABASE_USER")

"${PSQL[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${SCRATCH};"
"${PSQL[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${SCRATCH};"
gunzip -c "$DUMP" | "${PSQL[@]}" -d "$SCRATCH" -v ON_ERROR_STOP=1

"${PSQL[@]}" -d "$SCRATCH" -v ON_ERROR_STOP=1 -c "SELECT postgis_version();"
"${PSQL[@]}" -d "$SCRATCH" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS incidents FROM incidents;"
"${PSQL[@]}" -d "$SCRATCH" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS audit_logs FROM audit_logs;"
echo "Restore verify OK against ${SCRATCH}"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH};"
