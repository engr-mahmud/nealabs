#!/usr/bin/env bash
# Daily database backup. Run from cron, e.g.:
#   15 2 * * * /opt/nealabs/scripts/backup.sh >> /var/log/nealabs-backup.log 2>&1
# Requires: DATABASE_URL, BACKUP_DIR. Optional: BACKUP_REMOTE (rclone remote:path) for an off-server copy.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/nealabs-$(date -u +%Y%m%dT%H%M%SZ).dump"
TMP="$FILE.partial"
trap 'rm -f "$TMP"' EXIT
# Tenant tables use FORCE ROW LEVEL SECURITY; the bypass setting lets the dump read every organization.
PGOPTIONS="-c app.bypass_rls=on" pg_dump --enable-row-security --format=custom --no-owner --dbname="$DATABASE_URL" --file="$TMP"
pg_restore --list "$TMP" > /dev/null   # verify the archive is readable
mv "$TMP" "$FILE"
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  rclone copy "$FILE" "$BACKUP_REMOTE"
  echo "copied to $BACKUP_REMOTE"
fi
find "$BACKUP_DIR" -name 'nealabs-*.dump' -mtime +"$KEEP_DAYS" -delete
