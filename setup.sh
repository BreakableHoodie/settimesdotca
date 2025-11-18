#!/bin/bash

# SetTimes - Setup Script
set -e

echo "🎸 Setting up SetTimes..."

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

echo "✅ Setup complete!"
echo ""
echo "To run the app:"
echo "  Development (frontend only): cd frontend && npm run dev"
echo "  Full stack (Docker):         docker-compose up --build"
