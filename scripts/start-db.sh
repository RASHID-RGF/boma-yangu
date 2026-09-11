#!/usr/bin/env bash
# Start the local MongoDB used by the app.
#
# Prisma with MongoDB requires the server to run as a (single-node) replica set —
# a plain `mongod` start makes every database write fail with:
#   "Prisma needs to perform transactions, which requires your MongoDB server
#    to be run as a replica set."
#
# Usage:
#   npm run db:start     (or ./scripts/start-db.sh)

set -euo pipefail

DB_PATH="${MONGODB_DB_PATH:-/data/db}"
PORT="${MONGODB_PORT:-27017}"
LOG_PATH="${MONGODB_LOG_PATH:-/tmp/mongod.log}"
REPL_SET="${MONGODB_REPL_SET:-rs0}"

# Refuse to start twice on the same port.
if mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "db.runCommand({ping:1}).ok" >/dev/null 2>&1; then
  echo "✅ MongoDB already running on 127.0.0.1:${PORT}"
  exit 0
fi

echo "Starting mongod (replica set \"${REPL_SET}\", dbpath ${DB_PATH})..."
mongod --dbpath "${DB_PATH}" \
  --logpath "${LOG_PATH}" \
  --bind_ip 127.0.0.1 \
  --port "${PORT}" \
  --replSet "${REPL_SET}" \
  --fork

# Initiate the replica set on first start.
for i in $(seq 1 15); do
  if mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "db.runCommand({ping:1}).ok" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "db.hello().isWritablePrimary" | grep -q true; then
  mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "try { rs.initiate() } catch (e) { if (!e.message.includes('already initialized')) throw e }" >/dev/null
  echo "⏳ Waiting for replica set primary..."
  for i in $(seq 1 15); do
    if mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "db.hello().isWritablePrimary" | grep -q true; then
      break
    fi
    sleep 1
  done
fi

echo "✅ MongoDB ready on 127.0.0.1:${PORT} (replica set \"${REPL_SET}\", primary: $(mongosh --quiet "mongodb://127.0.0.1:${PORT}" --eval "db.hello().isWritablePrimary"))"