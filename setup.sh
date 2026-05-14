#!/bin/bash

# SetTimes - Setup Script
set -euo pipefail

echo "🎸 Setting up SetTimes..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm ci
cd ..

echo "✅ Setup complete!"
echo ""
echo "Local full-stack workflow:"
echo "  1. cp .env.example .dev.vars"
echo "  2. npm --prefix frontend run build"
echo "  3. ./frontend/node_modules/.bin/wrangler pages dev frontend/dist --port 8788 --persist-to .wrangler/state"
echo "  4. ./scripts/setup-local-db.sh"
echo ""
echo "One-step helper: ./init-dev-db.sh"
echo ""
echo "See README.md for more details."
