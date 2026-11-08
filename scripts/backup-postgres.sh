#!/usr/bin/env bash
set -euo pipefail
# Usage: ./scripts/backup-postgres.sh [outdir]
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/versys-${STAMP}.sql.gz"

: "${DATABASE_HOST:?}"
: "${DATABASE_USER:?}"
: "${DATABASE_NAME:?}"

export PGPASSWORD="${DATABASE_PASSWORD:-}"
pg_dump -h "$DATABASE_HOST" -p "${DATABASE_PORT:-5432}" -U "$DATABASE_USER" -d "$DATABASE_NAME" \
  --no-owner --format=plain | gzip > "$FILE"
echo "Wrote $FILE"
