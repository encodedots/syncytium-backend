import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * WAL Setup Script
 *
 * Ensures PostgreSQL WAL replication is properly configured
 */

// Configure SSL for RDS connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
    ? { rejectUnauthorized: false }
    : false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔧 Setting up PostgreSQL WAL Replication...\n');

  try {
    // Read and execute WAL setup SQL
    const sqlPath = path.join(__dirname, '../prisma/migrations/wal_setup.sql');

    if (!fs.existsSync(sqlPath)) {
      console.error('❌ wal_setup.sql not found at:', sqlPath);
      process.exit(1);
    }

    console.log('📄 Reading wal_setup.sql...');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split by semicolons and filter out comments and empty lines
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Executing ${statements.length} SQL statements...\n`);

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement);
        console.log(`✅ ${statement.substring(0, 50)}...`);
      } catch (error: any) {
        console.error(`❌ Failed: ${statement.substring(0, 50)}...`);
        console.error(`   Error: ${error.message}`);
      }
    }

    console.log('\n✅ WAL setup completed!');
    console.log('💡 Next steps:');
    console.log('   1. Restart the backend with: npm run start:dev');
    console.log('   2. Check logs to verify WAL connection is active');
    console.log('   3. Test real-time updates in the frontend\n');

  } catch (error) {
    console.error('❌ Error setting up WAL:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
