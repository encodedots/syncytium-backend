-- WAL Logical Replication Setup
-- This migration enables real-time data synchronization via PostgreSQL WAL

-- ============================================================================
-- PUBLICATION SETUP
-- ============================================================================

-- Drop existing publication if it exists (for re-runs)
DROP PUBLICATION IF EXISTS realtime_pub;

-- Create publication for real-time tables
-- This publishes INSERT, UPDATE, DELETE operations for specified tables
CREATE PUBLICATION realtime_pub FOR TABLE
  users,
  pcr_records;

-- Configure REPLICA IDENTITY FULL for pcr_records to include old values in UPDATE events
-- This is needed to detect tenant changes (old tenant_id vs new tenant_id)
ALTER TABLE pcr_records REPLICA IDENTITY FULL;

-- Verify publication was created
-- Run: SELECT * FROM pg_publication_tables WHERE pubname = 'realtime_pub';

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. WAL Level Configuration (already set in docker-compose.yml):
--    wal_level = logical
--    max_replication_slots = 4
--    max_wal_senders = 4

-- 2. Replication Slot:
--    The replication slot 'realtime_slot' will be created automatically
--    by the WalBridgeService on startup if it doesn't exist.

-- 3. Tables Included:
--    - User: User creation, updates, role changes
--    - PcrRecord: PCR record CRUD operations

-- 4. Replication Identity:
--    - users: Uses DEFAULT (primary key only)
--    - pcr_records: Uses FULL (all columns including old values)
--    For UPDATE events on pcr_records, payload.old will include tenant_id
--    to enable tenant change detection and proper real-time filtering.

-- 5. To manually check replication slot:
--    SELECT * FROM pg_replication_slots WHERE slot_name = 'realtime_slot';

-- 6. To manually drop replication slot (if needed):
--    SELECT pg_drop_replication_slot('realtime_slot');

-- 7. To check publication status:
--    SELECT * FROM pg_publication WHERE pubname = 'realtime_pub';

-- ============================================================================
