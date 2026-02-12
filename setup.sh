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
echo "To run the app:"
echo "  Development:  npm run dev"
echo "  With DB:      ./init-dev-db.sh"
echo ""
echo "See README.md for more details."
