import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function setupReplicaIdentity() {
  console.log('🔧 Setting up Replica Identity...\n');

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '../prisma/migrations/fix_replica_identity.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

    // Split by semicolons and filter out comments and empty statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => {
        // Remove pure comment lines and empty statements
        const cleanStmt = stmt
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
        return cleanStmt.length > 0;
      });

    console.log('📝 Executing SQL statements...\n');

    for (const statement of statements) {
      if (statement) {
        try {
          const result = await prisma.$executeRawUnsafe(statement);
          console.log(`✅ Executed: ${statement.substring(0, 60)}...`);
        } catch (error) {
          // Some statements might be queries not commands, try queryRaw
          try {
            const result = await prisma.$queryRawUnsafe(statement);
            console.log(`✅ Query result:`, result);
          } catch (queryError) {
            console.error(`❌ Failed to execute:`, statement.substring(0, 60));
            console.error(`   Error:`, (error as Error).message);
          }
        }
      }
    }

    console.log('\n🔍 Verifying replica identity settings...\n');

    const verifyQuery = `
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
    `;

    const results: any[] = await prisma.$queryRawUnsafe(verifyQuery);

    console.log('📊 Current Replica Identity Settings:');
    console.log('═══════════════════════════════════════════');
    results.forEach(row => {
      const status = row.replica_identity.includes('FULL') ? '✅' : '⚠️';
      console.log(`${status} ${row.table_name}: ${row.replica_identity}`);
    });
    console.log('═══════════════════════════════════════════\n');

    const allFull = results.every(row => row.replica_identity.includes('FULL'));
    if (allFull) {
      console.log('✅ All tables configured correctly with REPLICA IDENTITY FULL!\n');
    } else {
      console.log('⚠️  Some tables are not set to FULL. Real-time updates may not work correctly.\n');
    }

  } catch (error) {
    console.error('❌ Error setting up replica identity:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

setupReplicaIdentity();
