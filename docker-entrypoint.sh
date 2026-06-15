#!/bin/sh
set -e

echo "[entrypoint] Running database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] Starting application..."
exec node dist/main.js