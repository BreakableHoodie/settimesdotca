#!/bin/bash
set -e

# Production Database Setup Script
# Usage: ./scripts/setup-prod-db.sh

echo "🚀 SetTimes Production Database Setup"
echo "====================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: 'wrangler' is not installed."
    echo "   Please run: npm install -g wrangler"
    exit 1
fi

echo "ℹ️  This script assumes you have:"
echo "   1. Authenticated with Cloudflare (wrangler login)"
echo "   2. Created the production database (wrangler d1 create settimes-production-db)"
echo "   3. Updated wrangler.toml with the new database_id"
echo ""
read -p "Have you completed these steps? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please complete the prerequisites and run this script again."
    echo "Tip: Run 'wrangler d1 create settimes-production-db' to get the ID."
    exit 1
fi

DB_NAME="settimes-production-db"
ENV="production"

echo ""
echo "📦 Applying database migrations..."
wrangler d1 migrations apply $DB_NAME --remote

echo ""
if [ -f "database/seed-production.sql" ]; then
    echo "🌱 Importing production seed data..."
    wrangler d1 execute $DB_NAME --file=database/seed-production.sql --remote
else
    echo "⚠️  No production seed file found (database/seed-production.sql)."
    echo "   Run scripts/export-local-data.sh and then scripts/import-production-data.sh."
fi

echo ""
echo "✅ Database setup complete!"
echo "   Next steps:"
echo "   1. Set environment variables in Cloudflare Dashboard"
echo "      - PUBLIC_DATA_PUBLISH_ENABLED=false (until you’re ready to go live)"
echo "   2. Deploy the application: npm run deploy:prod"
