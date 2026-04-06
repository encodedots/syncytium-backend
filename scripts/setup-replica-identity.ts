import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function setupReplicaIdentity() {
  console.log('🔧 Setting up Replica Identity...\n');

  try {
    // Set REPLICA IDENTITY FULL for pcr_records
    console.log('📝 Setting REPLICA IDENTITY FULL for pcr_records...');
    await prisma.$executeRawUnsafe('ALTER TABLE pcr_records REPLICA IDENTITY FULL;');
    console.log('✅ Replica identity set for pcr_records\n');

    // Set REPLICA IDENTITY FULL for users
    console.log('📝 Setting REPLICA IDENTITY FULL for users...');
    await prisma.$executeRawUnsafe('ALTER TABLE users REPLICA IDENTITY FULL;');
    console.log('✅ Replica identity set for users\n');

    // Verify replica identity
    console.log('🔍 Verifying replica identity settings...\n');

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

    console.log('📊 Current Replica Identity Settings:');
    console.log('═══════════════════════════════════════════');
    replicaSettings.forEach(row => {
      const status = row.replica_identity.includes('FULL') ? '✅' : '⚠️';
      console.log(`${status} ${row.table_name}: ${row.replica_identity}`);
    });
    console.log('═══════════════════════════════════════════\n');

    const allFull = replicaSettings.every(row => row.replica_identity.includes('FULL'));
    if (allFull) {
      console.log('✅ All tables configured correctly with REPLICA IDENTITY FULL!\n');
      console.log('📝 What this means:');
      console.log('   • UPDATE events will include ALL column values (old and new)');
      console.log('   • You can detect tenant changes in real-time');
      console.log('   • Old tenant_id will be available in WAL payload.old\n');
    } else {
      console.log('⚠️  Some tables are not set to FULL. Real-time updates may not work correctly.\n');
    }

  } catch (error) {
    console.error('❌ Error setting up replica identity:', error);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Ensure DATABASE_URL is set in your .env file');
    console.error('   2. Ensure PostgreSQL is running');
    console.error('   3. Ensure you have ALTER TABLE permissions\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

setupReplicaIdentity();
