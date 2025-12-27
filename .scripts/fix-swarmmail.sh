#!/usr/bin/env bash
# Quick fix for swarm-mail.db initialization issue
# Run: ./fix-swarmmail.sh

set -e

SWARM_MAIL_DB="${XDG_CONFIG_HOME:-$HOME/.config}/swarm-tools/swarm-mail.db"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking swarm-mail.db status..."

if [ ! -f "$SWARM_MAIL_DB" ]; then
  echo "Database file not found. Creating new database at $SWARM_MAIL_DB"
  touch "$SWARM_MAIL_DB"
  sqlite3 "$SWARM_MAIL_DB" < "$SCRIPT_DIR/migrate-swarmmail.sql"
  echo "✓ Database created and initialized"
  echo "Tables: $(sqlite3 "$SWARM_MAIL_DB" '.tables')"
  exit 0
fi

# Check if file is empty
if [ ! -s "$SWARM_MAIL_DB" ]; then
  echo "Database is empty (0 bytes). Applying migration..."

  sqlite3 "$SWARM_MAIL_DB" < "$SCRIPT_DIR/migrate-swarmmail.sql"

  echo "✓ Migration complete. Verifying tables..."
  sqlite3 "$SWARM_MAIL_DB" ".tables"
else
  echo "Database already has tables:"
  sqlite3 "$SWARM_MAIL_DB" ".tables"

  read -p "Do you want to reinitialize anyway? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Backing up..."
    cp "$SWARM_MAIL_DB" "${SWARM_MAIL_DB}.backup.$(date +%s)"
    echo "Reinitializing..."
    sqlite3 "$SWARM_MAIL_DB" < "$SCRIPT_DIR/migrate-swarmmail.sql"
    echo "✓ Done"
  fi
fi

echo "Migration status: OK"
