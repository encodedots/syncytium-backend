#!/bin/sh
set -e

echo "🚀 Starting Syncytium Backend..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Run database seeding (idempotent)
# Note: Seeding requires ts-node which isn't available in production build
# The seed will run during development or can be run manually
echo "🌱 Checking database seed status..."
if command -v ts-node > /dev/null 2>&1; then
  echo "Running database seed..."
  npx prisma db seed || echo "⚠️  Seeding failed (may already be seeded)"
else
  echo "⚠️  ts-node not available, skipping seed (run manually if needed: npx prisma db seed)"
fi

# Start the application
echo "✅ Starting application..."
exec node dist/src/main
