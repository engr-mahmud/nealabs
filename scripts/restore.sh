#!/usr/bin/env bash
# Restore a backup into an EMPTY database (never over live data without a fresh backup first).
# Usage: DATABASE_URL=postgres://... scripts/restore.sh backups/nealabs-20260101T021500Z.dump
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
FILE="${1:?backup file required}"
PGOPTIONS="-c app.bypass_rls=on" pg_restore --enable-row-security --no-owner --exit-on-error --dbname="$DATABASE_URL" "$FILE"
echo "restore ok from $FILE"
