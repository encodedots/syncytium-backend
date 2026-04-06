# Real-Time Tenant Change Detection Fix

## Problem

When updating a PCR record's tenant assignment:
- First update works correctly (e.g., City Hospital → Syncitium)
- Second update fails (e.g., Syncitium → City Hospital back)
- Record remains visible when it shouldn't or doesn't appear when it should

## Root Cause

PostgreSQL WAL (Write-Ahead Log) doesn't include old column values in UPDATE events by default. It only includes the primary key. This means `payload.old.tenant_id` is `null`, so the frontend can't detect tenant changes properly.

## Solution

Set `REPLICA IDENTITY FULL` on the `pcr_records` table. This tells PostgreSQL to include ALL old column values in UPDATE events.

## How to Apply the Fix

### Option 1: Using psql (Recommended)

```bash
# Connect to your database
docker exec -it syncytium-db psql -U syncytium_user -d syncytium_db

# Run the fix
\i /app/prisma/migrations/fix_replica_identity.sql

# Verify it worked (should show "FULL (all columns)")
SELECT
  c.relname as table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (primary key only)'
    WHEN 'f' THEN 'FULL (all columns)'
  END as replica_identity
FROM pg_class c
WHERE c.relname = 'pcr_records';
```

### Option 2: Quick Fix (Direct SQL)

```bash
docker exec -it syncytium-db psql -U syncytium_user -d syncytium_db -c "ALTER TABLE pcr_records REPLICA IDENTITY FULL; ALTER TABLE users REPLICA IDENTITY FULL;"
```

### Option 3: Using npm script

Add this to your `package.json`:

```json
{
  "scripts": {
    "fix:replica-identity": "docker exec -it syncytium-db psql -U syncytium_user -d syncytium_db -c 'ALTER TABLE pcr_records REPLICA IDENTITY FULL; ALTER TABLE users REPLICA IDENTITY FULL;'"
  }
}
```

Then run:
```bash
npm run fix:replica-identity
```

## Verification

After applying the fix:

1. **Check the setting:**
   ```bash
   docker exec syncytium-db psql -U syncytium_user -d syncytium_db -c "SELECT relname, relreplident FROM pg_class WHERE relname = 'pcr_records';"
   ```
   Should output: `pcr_records | f` (f = FULL)

2. **Restart the backend** to ensure WAL bridge reconnects:
   ```bash
   docker-compose restart backend
   # or
   npm run dev
   ```

3. **Test tenant changes:**
   - As ADMIN, update a PCR record from Tenant A to Tenant B
   - Verify managers from Tenant A see it disappear
   - Verify managers from Tenant B see it appear
   - Update it back from Tenant B to Tenant A
   - Verify it works correctly in both directions

## Why This Matters

With `REPLICA IDENTITY FULL`:
- `payload.old.tenant_id` is populated in UPDATE events
- Frontend can compare old vs new tenant
- Managers properly see records added/removed when tenants change
- Works correctly for multiple consecutive tenant changes

## Frontend Changes (Already Applied)

The frontend has been updated to:
1. Hide tenant name column for managers in PCR listing
2. Hide tenant field for managers in PCR detail page
3. Better handle tenant change detection with fallback logic

## Performance Note

`REPLICA IDENTITY FULL` increases WAL size slightly because it includes all old column values. For the `pcr_records` table, this is minimal and worth the benefit of reliable real-time updates.
