-- Create publication for WAL logical replication
-- This allows the backend to receive real-time updates from PostgreSQL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'realtime_pub'
  ) THEN
    CREATE PUBLICATION realtime_pub FOR ALL TABLES;
    RAISE NOTICE 'Created publication: realtime_pub';
  ELSE
    RAISE NOTICE 'Publication realtime_pub already exists';
  END IF;
END
$$;
