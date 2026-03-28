#!/usr/bin/env bash
set -euo pipefail

# Build and run UHLD locally using Docker Compose.
# Usage: ./build-run.sh [--no-cache]

NO_CACHE=""
if [[ "${1:-}" == "--no-cache" ]]; then
  NO_CACHE="--no-cache"
fi

# Check for .env file
if [[ ! -f .env ]]; then
  echo "⚠️  No .env found — copying .env.example to .env"
  cp .env.example .env
  echo "📝  Edit .env and set JWT_SECRET and ENCRYPTION_KEY, then re-run."
  exit 1
fi

echo "🔨  Building image…"
docker compose build $NO_CACHE

echo "🚀  Starting UHLD…"
docker compose up -d

echo "✅  UHLD is running at http://localhost:8222"
echo ""
echo "To create the first admin user:"
echo "  docker compose exec uhld python -m backend.cli create-user admin yourpassword"
echo ""
echo "Logs: docker compose logs -f uhld"
