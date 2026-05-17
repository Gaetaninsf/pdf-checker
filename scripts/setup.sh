#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

./scripts/verify_setup.sh

echo "Installing API dependencies..."
(
  cd apps/api
  npm install
)

echo "Installing web dependencies..."
(
  cd apps/web
  npm install
)

echo ""
echo "Setup complete."
echo "Next steps:"
echo "  1. Copy .env.example to .env.local and add your Box credentials."
echo "  2. Run: make dev"
echo "  3. Open http://127.0.0.1:3000"
