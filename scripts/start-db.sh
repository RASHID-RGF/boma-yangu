#!/usr/bin/env bash
# Start the local PostgreSQL database used by the app.
#
# Usage:
#   npm run db:start     (or ./scripts/start-db.sh)

set -euo pipefail

DB_NAME="${POSTGRES_DB:-bomayangu}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Check if PostgreSQL is already running
if pg_isready -h localhost -p "${DB_PORT}" -q 2>/dev/null; then
  echo "✅ PostgreSQL already running on port ${DB_PORT}"
else
  echo "Starting PostgreSQL..."
  sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster 17 main start 2>/dev/null || {
    echo "⚠️  Could not start PostgreSQL automatically."
    echo "   Please start it manually: sudo service postgresql start"
    exit 1
  }
  
  # Wait for PostgreSQL to be ready
  for i in $(seq 1 15); do
    if pg_isready -h localhost -p "${DB_PORT}" -q 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

# Create the database if it doesn't exist
if ! psql -h localhost -p "${DB_PORT}" -U "${DB_USER}" -lqt 2>/dev/null | grep -qw "${DB_NAME}"; then
  echo "Creating database '${DB_NAME}'..."
  psql -h localhost -p "${DB_PORT}" -U "${DB_USER}" -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || {
    echo "⚠️  Could not create database. Check PostgreSQL credentials."
  }
fi

echo "✅ PostgreSQL ready on localhost:${DB_PORT} (database: ${DB_NAME})"
