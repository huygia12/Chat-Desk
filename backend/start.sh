#!/bin/sh
# Auto-run migrations before starting the server
set -e

# Set default PORT if not provided
PORT=${PORT:-8000}

echo "=== ChatDesk Startup ==="
echo "PORT: $PORT"
echo "DATABASE_URL set: $(if [ -n "$DATABASE_URL" ]; then echo 'YES'; else echo 'NO (using default)'; fi)"

# Run database migrations
echo ""
echo "==> Running database migrations..."
if alembic upgrade head; then
    echo "==> Migrations completed successfully"
else
    echo "==> Migration failed! Starting server anyway..."
fi

# Start the server
echo ""
echo "==> Starting server on port $PORT..."
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
