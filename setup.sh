#!/bin/bash

# SetTimes - Setup Script
set -e

echo "🎸 Setting up SetTimes..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "✅ Setup complete!"
echo ""
echo "To run the app:"
echo "  Development:  npm run dev"
echo "  With DB:      ./init-dev-db.sh"
echo ""
echo "See README.md for more details."
