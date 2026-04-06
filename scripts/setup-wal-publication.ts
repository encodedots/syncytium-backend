import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Configure SSL for RDS connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
    ? { rejectUnauthorized: false }
    : false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function setupWalPublication() {
  console.log('🔧 Setting up WAL Publication for Real-Time Sync...\n');

  try {
    // Drop existing publication if it exists
    console.log('📝 Dropping existing publication (if exists)...');
    try {
      await prisma.$executeRawUnsafe('DROP PUBLICATION IF EXISTS realtime_pub;');
      console.log('✅ Existing publication dropped\n');
    } catch (error) {
      console.log('ℹ️  No existing publication to drop\n');
    }

    // Create publication for real-time tables
    console.log('📝 Creating publication for users and pcr_records tables...');
    await prisma.$executeRawUnsafe(`
      CREATE PUBLICATION realtime_pub FOR TABLE users, pcr_records;
    `);
    console.log('✅ Publication created\n');

    // Set REPLICA IDENTITY FULL for pcr_records
    console.log('📝 Setting REPLICA IDENTITY FULL for pcr_records...');
    await prisma.$executeRawUnsafe('ALTER TABLE pcr_records REPLICA IDENTITY FULL;');
    console.log('✅ Replica identity set for pcr_records\n');

    // Optional: Set for users table too
    console.log('📝 Setting REPLICA IDENTITY FULL for users...');
    await prisma.$executeRawUnsafe('ALTER TABLE users REPLICA IDENTITY FULL;');
    console.log('✅ Replica identity set for users\n');

    // Verify publication was created
    console.log('🔍 Verifying publication...\n');
    const pubTables: any[] = await prisma.$queryRawUnsafe(`
      SELECT schemaname, tablename
      FROM pg_publication_tables
      WHERE pubname = 'realtime_pub'
      ORDER BY tablename;
    `);

    console.log('📊 Publication Tables:');
    console.log('═══════════════════════════════════════════');
    pubTables.forEach(row => {
      console.log(`✅ ${row.schemaname}.${row.tablename}`);
    });
    console.log('═══════════════════════════════════════════\n');

    // Verify replica identity
    const replicaSettings: any[] = await prisma.$queryRawUnsafe(`
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
    `);

    console.log('📊 Replica Identity Settings:');
    console.log('═══════════════════════════════════════════');
    replicaSettings.forEach(row => {
      const status = row.replica_identity.includes('FULL') ? '✅' : '⚠️';
      console.log(`${status} ${row.table_name}: ${row.replica_identity}`);
    });
    console.log('═══════════════════════════════════════════\n');

    console.log('✅ WAL Publication setup completed successfully!\n');
    console.log('📝 Notes:');
    console.log('   • The replication slot "realtime_slot" will be created automatically');
    console.log('   • by the WalBridgeService when the backend starts');
    console.log('   • Make sure PostgreSQL is configured with:');
    console.log('     - wal_level = logical');
    console.log('     - max_replication_slots >= 4');
    console.log('     - max_wal_senders >= 4\n');

  } catch (error) {
    console.error('❌ Error setting up WAL publication:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

setupWalPublication();
