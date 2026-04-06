#!/bin/bash

# Fix Replica Identity for Real-Time Tenant Change Detection
# This script sets REPLICA IDENTITY FULL on pcr_records and users tables

set -e

echo "================================================================"
echo "Fixing PostgreSQL Replica Identity for Real-Time Updates"
echo "================================================================"
echo ""
echo "This fixes real-time syncing for:"
echo "  • PCR tenant changes (consecutive updates now work!)"
echo "  • User tenant changes (reassigning managers to different tenants)"
echo "  • User deletions (proper removal from manager listings)"
echo ""

# Check if Docker container is running
if ! docker ps | grep -q syncytium-postgres; then
    echo "❌ Error: syncytium-postgres container is not running"
    echo "   Please start your Docker containers first:"
    echo "   docker-compose up -d"
    exit 1
fi

echo "✅ Docker container is running"
echo ""

# Apply the fix
echo "📝 Applying REPLICA IDENTITY FULL to pcr_records and users tables..."
docker exec syncytium-postgres psql -U poc_user -d poc_db -c "
ALTER TABLE pcr_records REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
SELECT 'Success: REPLICA IDENTITY updated' as status;
"

echo ""
echo "✅ Database fix applied successfully!"
echo ""

# Verify the fix
echo "🔍 Verifying REPLICA IDENTITY settings..."
docker exec syncytium-postgres psql -U poc_user -d poc_db -c "
SELECT
  c.relname as table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (primary key only) ❌'
    WHEN 'f' THEN 'FULL (all columns) ✅'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END as replica_identity
FROM pg_class c
WHERE c.relname IN ('pcr_records', 'users')
ORDER BY c.relname;
"

echo ""
echo "================================================================"
echo "Next Steps:"
echo "================================================================"
echo "1. Restart the backend to reconnect WAL bridge:"
echo "   docker-compose restart backend"
echo "   # or if running locally:"
echo "   # npm run dev"
echo ""
echo "2. Test PCR tenant changes:"
echo "   - Create a PCR in Tenant A"
echo "   - Change it to Tenant B → should work ✓"
echo "   - Change it back to Tenant A → should NOW work! ✓"
echo ""
echo "3. Test User tenant changes:"
echo "   - As Admin, update a Manager's tenant from A to B"
echo "   - Verify Manager A users see it disappear in real-time ✓"
echo "   - Verify Manager B users see it appear in real-time ✓"
echo ""
echo "4. Test User deletions:"
echo "   - As Admin, delete a Manager user"
echo "   - Verify it disappears from Manager listings in real-time ✓"
echo ""
echo "See REALTIME_FIXES_SUMMARY.md for detailed testing instructions"
echo "================================================================"
