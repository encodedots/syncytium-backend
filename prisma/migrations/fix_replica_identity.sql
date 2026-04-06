-- ============================================================================
-- FIX: Ensure REPLICA IDENTITY FULL is set for pcr_records
-- ============================================================================
-- This ensures that UPDATE events include old column values (especially tenant_id)
-- so we can properly detect tenant changes in real-time updates

-- Check current replica identity setting
-- Run this first to see current setting:
-- SELECT relname, relreplident
-- FROM pg_class
-- WHERE relname IN ('pcr_records', 'users');
--
-- relreplident values:
--   'd' = DEFAULT (only primary key)
--   'f' = FULL (all columns)
--   'i' = INDEX
--   'n' = NOTHING

-- Set REPLICA IDENTITY FULL for pcr_records
-- This makes payload.old include ALL columns in UPDATE events
ALTER TABLE pcr_records REPLICA IDENTITY FULL;

-- Optional: Also set it for users table if you need old role values
ALTER TABLE users REPLICA IDENTITY FULL;

-- Verify the change
SELECT
  c.relname as table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (primary key only)'
    WHEN 'f' THEN 'FULL (all columns)'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END as replica_identity
FROM pg_class c
WHERE c.relname IN ('pcr_records', 'users')
ORDER BY c.relname;
